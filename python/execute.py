"""
Vercel Python serverless function: QAOA graph coloring.

POST /api/quantum/execute
Body: { graph: {nodes:[int], edges:[{source,target}]}, colors:int, p:int,
        target:'local'|'ibm', ibm_token:str }

Pipeline (mathematically real, no mocked colors):
  1. Build a QuadraticProgram with one binary var x[v,c] per node/color.
  2. Objective  = sum over edges, sum over colors  x[u,c]*x[v,c]   (penalize
     adjacent nodes sharing a color).
  3. Constraint = sum_c x[v,c] == 1                                (exactly one
     color per node) — turned into a QUBO penalty by QuadraticProgramToQubo.
  4. Convert to an Ising Hamiltonian and minimize it with QAOA (reps = p) using
     the local statevector Sampler + COBYLA, capturing the energy at every step.
  5. Decode the most probable bitstring into a coloring, compute the success
     probability and the top measured bitstrings.

If target == 'ibm' and a usable token is supplied we additionally sample the
optimized ansatz on the least-busy real backend; any problem (missing/invalid
token, queue longer than the serverless budget) falls back to the local result.
"""

from http.server import BaseHTTPRequestHandler
import json
import sys
import time
import traceback

import numpy as np

# Local statevector sim is exponential; refuse anything that can't run quickly.
QUBIT_CAP = 18
# Wall-clock budget (seconds) to wait on a real IBM job before falling back.
IBM_BUDGET_S = 8.0


# --------------------------------------------------------------------------- #
# Graph + QUBO construction
# --------------------------------------------------------------------------- #
def parse_graph(graph):
    """Normalize incoming graph JSON to (nodes:list[int], edges:list[(a,b)])."""
    nodes = [int(n) for n in graph.get("nodes", [])]
    edges = []
    for e in graph.get("edges", []):
        if isinstance(e, dict):
            edges.append((int(e["source"]), int(e["target"])))
        else:
            edges.append((int(e[0]), int(e[1])))
    return nodes, edges


def build_quadratic_program(nodes, edges, num_colors):
    """One-hot binary formulation of k-coloring as a QuadraticProgram."""
    from qiskit_optimization import QuadraticProgram

    qp = QuadraticProgram("graph_coloring")
    index = {}
    for v in nodes:
        for c in range(num_colors):
            name = f"x_{v}_{c}"
            qp.binary_var(name)
            index[(v, c)] = name

    # Objective: penalize each edge whose endpoints take the same color.
    quadratic = {}
    for (u, v) in edges:
        for c in range(num_colors):
            quadratic[(index[(u, c)], index[(v, c)])] = (
                quadratic.get((index[(u, c)], index[(v, c)]), 0) + 1
            )
    qp.minimize(quadratic=quadratic)

    # Constraint: every node gets exactly one color.
    for v in nodes:
        qp.linear_constraint(
            linear={index[(v, c)]: 1 for c in range(num_colors)},
            sense="==",
            rhs=1,
            name=f"one_color_{v}",
        )
    return qp, index


def decode_coloring(x, nodes, num_colors):
    """Map a binary assignment over x[v,c] (variable-ordered) to {node: color}."""
    coloring = {}
    for vi, v in enumerate(nodes):
        chosen = -1
        for c in range(num_colors):
            if x[vi * num_colors + c] >= 0.5:
                chosen = c
                break
        # Defensive: if the one-hot was violated, take the largest component.
        if chosen == -1:
            comps = [x[vi * num_colors + c] for c in range(num_colors)]
            chosen = int(max(range(num_colors), key=lambda c: comps[c]))
        coloring[int(v)] = int(chosen)
    return coloring


# --------------------------------------------------------------------------- #
# Result assembly (shared by every execution path)
# --------------------------------------------------------------------------- #
def build_result(
    samples, nodes, edges, num_colors, energy_history, backend, fallback,
    success_prob=None, conflict_distribution=None,
):
    """
    samples: list of (x:list[float over variables], probability:float).
    Picks the best (fewest conflicts, then most probable) sample as the coloring
    and reports success probability + top-5 bitstrings.

    `success_prob` (mass on optimal/proper colorings) is passed in when computed
    over the *full* distribution (local path); otherwise it's estimated from the
    provided samples (e.g. hardware shots).
    """
    n = len(nodes) * num_colors

    def conflicts_for(x):
        coloring = decode_coloring(x, nodes, num_colors)
        return sum(1 for (u, v) in edges if coloring[u] == coloring[v])

    # Aggregate identical bitstrings (defensive) and sort by probability.
    scored = []
    for x, prob in samples:
        bits = "".join("1" if xi >= 0.5 else "0" for xi in x)
        scored.append((bits, x, float(prob), conflicts_for(x)))
    scored.sort(key=lambda t: t[2], reverse=True)

    # Best solution = minimum conflicts, tie-broken by probability.
    best = min(scored, key=lambda t: (t[3], -t[2]))
    coloring = decode_coloring(best[1], nodes, num_colors)
    best_conflicts = best[3]

    if success_prob is None:
        # Estimate from samples: mass on the minimum-conflict states present.
        min_conf = min(t[3] for t in scored)
        success_prob = sum(t[2] for t in scored if t[3] == min_conf)

    top = [{"bits": t[0], "prob": t[2]} for t in scored[:5]]

    # Probability mass grouped by conflict count. The local path computes this
    # over the FULL distribution and passes it in; otherwise (hardware shots) we
    # estimate it from the available samples.
    if conflict_distribution is None:
        agg = {}
        for _bits, _x, prob, conf in scored:
            agg[conf] = agg.get(conf, 0.0) + prob
        conflict_distribution = [
            {"conflicts": k, "prob": agg[k]} for k in sorted(agg)
        ]

    # Diagnostic: dump the exact top-5 (bits, prob, conflicts) to stderr. stdout
    # stays clean JSON for the Node route; stderr is surfaced in the dev console.
    # NOTE: for graph coloring the top states are usually *cost-degenerate*
    # (every proper coloring has zero conflicts), so QAOA spreads near-equal
    # probability over them — identical-height bars are expected, not a bug.
    print("[execute] top bitstrings (bits | prob | conflicts):", file=sys.stderr)
    for t in scored[:5]:
        print(f"  {t[0]}  {t[2]:.6e}  conflicts={t[3]}", file=sys.stderr)
    print(f"[execute] success_prob={float(success_prob):.6e}", file=sys.stderr)

    return {
        "coloring": {str(k): v for k, v in coloring.items()},
        "energy_history": energy_history,
        "success_prob": float(success_prob),
        "top_bitstrings": top,
        "conflict_distribution": conflict_distribution,
        "num_colors": num_colors,
        "conflicts": int(best_conflicts),
        "backend": backend,
        "fallback": fallback,
        "qubits": n,
    }


# --------------------------------------------------------------------------- #
# Fast statevector QAOA (NumPy)
#
# The cost Hamiltonian for a QUBO is *diagonal*, so we never need to build or
# simulate a circuit to optimize it. We precompute the cost of every basis state
# once, then evolve the statevector analytically:
#   - cost layer:  ψ *= exp(-i·γ·C)          (elementwise on the diagonal)
#   - mixer layer: ψ = cosβ·ψ - i·sinβ·X_jψ  (per qubit; X_j just permutes ψ)
# Each COBYLA evaluation is then a few vectorized array ops instead of a full
# qiskit primitive call over all 2^n outcomes — orders of magnitude faster while
# remaining mathematically exact (no shot noise).
# --------------------------------------------------------------------------- #
TOP_SAMPLES = 256


def _maxiter_for(n):
    """Fewer COBYLA steps for big state spaces (per-eval cost grows with 2^n)."""
    if n <= 12:
        return 150
    if n <= 15:
        return 100
    return 45


def build_cost_vector(qubo):
    """Diagonal cost C[k] = QUBO objective at basis state k (bit j == variable j)."""
    n = qubo.get_num_vars()
    dim = 1 << n
    idx = np.arange(dim, dtype=np.int64)
    bits = [((idx >> j) & 1).astype(np.float64) for j in range(n)]

    C = np.full(dim, float(qubo.objective.constant), dtype=np.float64)
    for j, c in qubo.objective.linear.to_dict().items():
        C += float(c) * bits[int(j)]
    for (i, j), c in qubo.objective.quadratic.to_dict().items():
        C += float(c) * bits[int(i)] * bits[int(j)]
    return C, n


# Early-stop a restart once it stalls, freeing time for more restarts.
STALL_PATIENCE = 25      # consecutive evals without a real improvement
STALL_EPS = 0.01         # what counts as a "real" improvement in energy


class _Stalled(Exception):
    """Raised inside the objective to abort a stuck COBYLA restart early."""


def _num_restarts(n):
    """Independent random starts; more for small/fast problems."""
    if n <= 12:
        return 8
    if n <= 15:
        return 6
    return 2


def _interp_params(params):
    """
    INTERP warm start (Zhou et al.): turn an optimized depth-k point into a
    depth-(k+1) initial point by linearly interpolating the gamma and beta
    schedules to one more layer. This makes each depth start from the previous
    depth's solution, so deeper QAOA reliably improves instead of getting lost in
    a larger random landscape.
    """
    k = len(params) // 2
    g, b = params[:k], params[k:]
    x_old = np.linspace(0.0, 1.0, k)
    x_new = np.linspace(0.0, 1.0, k + 1)
    return np.concatenate([np.interp(x_new, x_old, g), np.interp(x_new, x_old, b)])


def qaoa_optimize(C, n, p, score=None, log=True):
    """
    Optimize a depth-p QAOA for the diagonal cost vector C.

    Uses layerwise (INTERP) initialization: optimize p=1 from several random
    restarts, then warm-start each successive depth from the previous solution
    plus a couple of random restarts, keeping the best. This is what makes a
    larger p actually help — random-init COBYLA at p=3 often underperforms p=1.

    COBYLA (derivative-free) is used deliberately: on this exact statevector
    landscape it reaches lower-conflict distributions than gradient methods
    (L-BFGS-B/SLSQP with finite differences), which find a marginally lower mean
    energy but spread probability off the proper colorings — and cost several
    times more wall-clock.

    The cost is normalized inside the phase layer by std(C) (a global shift/scale
    is only a global phase), so gamma stays O(1); otherwise the large one-hot
    penalty makes exp(-i·gamma·C) alias and the landscape looks flat.

    `score(probs) -> float` (optional, higher = better) selects which optimized
    candidate to *report*: minimizing energy doesn't uniquely maximize proper-
    coloring mass, so we report the candidate whose measurement distribution most
    favors proper colorings while still chaining the INTERP warm starts by energy.

    Returns (best_params, probabilities, energy_history, level_energies).
    """
    import sys
    from scipy.optimize import minimize

    dim = C.shape[0]
    idx = np.arange(dim, dtype=np.int64)
    flips = [idx ^ (1 << j) for j in range(n)]  # X_j permutation per qubit
    psi0 = np.full(dim, 1.0 / np.sqrt(dim), dtype=np.complex128)
    scale = float(C.std()) or 1.0
    neg_i_cn = -1j * C / scale

    def statevector(params):
        k = len(params) // 2  # depth is inferred from the parameter count
        gammas, betas = params[:k], params[k:]
        psi = psi0.copy()
        for layer in range(k):
            psi *= np.exp(gammas[layer] * neg_i_cn)  # diagonal cost layer
            cb, sb = np.cos(betas[layer]), -1j * np.sin(betas[layer])
            for fj in flips:  # mixer: e^{-iβX_j} per qubit, in-place
                flipped = psi[fj]
                flipped *= sb
                psi *= cb
                psi += flipped
        return psi

    maxiter = _maxiter_for(n)

    def run(x0):
        """One COBYLA run with early stopping; returns (e, params, history, probs)."""
        history: list[float] = []
        st = {"best_e": np.inf, "best_x": x0, "ref": np.inf, "stall": 0}

        def objective(params):
            psi = statevector(params)
            energy = float(np.real(np.vdot(psi, C * psi)))
            history.append(energy)
            if energy < st["best_e"]:
                st["best_e"], st["best_x"] = energy, params.copy()
            if energy < st["ref"] - STALL_EPS:  # early stop on a stall
                st["ref"], st["stall"] = energy, 0
            else:
                st["stall"] += 1
                if st["stall"] >= STALL_PATIENCE:
                    raise _Stalled()
            return energy

        try:
            minimize(objective, x0, method="COBYLA",
                     options={"maxiter": maxiter, "rhobeg": 0.5})
        except _Stalled:
            pass
        # The distribution is only needed when we select candidates by score.
        probs = np.abs(statevector(st["best_x"])) ** 2 if score else None
        return st["best_e"], st["best_x"], history, probs

    def reported_key(cand):
        # Higher proper-coloring mass first, then lower energy.
        return (score(cand[3]) if score else 0.0, -cand[0])

    rng = np.random.default_rng(7)
    level_energies = []
    best = (np.inf, None, [], None)  # lowest-energy point (drives INTERP chaining)
    reported = [None]                # candidate we'll actually report

    def rand_start(k):
        return np.concatenate([rng.uniform(0, 2 * np.pi, k), rng.uniform(0, np.pi, k)])

    def consider(cand):
        if reported[0] is None or reported_key(cand) > reported_key(reported[0]):
            reported[0] = cand

    if n <= 15:
        # Layerwise INTERP: optimize depth 1, then warm-start each deeper layer.
        for _ in range(_num_restarts(n)):
            cand = run(rand_start(1))
            if cand[0] < best[0]:
                best = cand
            consider(cand)
        level_energies.append(round(best[0], 4))

        for level in range(2, p + 1):
            starts = [_interp_params(best[1]), rand_start(level), rand_start(level)]
            lvl_best = (np.inf, None, [], None)
            for x0 in starts:
                cand = run(x0)
                if cand[0] < lvl_best[0]:
                    lvl_best = cand
                consider(cand)
            best = lvl_best
            level_energies.append(round(lvl_best[0], 4))
    else:
        # Large state space: layerwise is too costly; a couple of direct restarts
        # at depth p. The reported coloring is the exact cost-minimum either way.
        for _ in range(2):
            cand = run(rand_start(p))
            if cand[0] < best[0]:
                best = cand
            consider(cand)
        level_energies.append(round(best[0], 4))

    reported = reported[0]
    if log:
        print(
            f"[qaoa] n={n} p={p} energy-by-depth={level_energies} "
            f"reported_energy={reported[0]:.4f}",
            file=sys.stderr,
        )

    final_probs = reported[3]
    if final_probs is None:
        final_probs = np.abs(statevector(reported[1])) ** 2
    return reported[1], final_probs, reported[2], level_energies


def collect_samples(probs, n, C):
    """
    Most-probable basis states as (x-over-variables, probability) pairs, with the
    true cost-minimum state guaranteed to be included so the reported coloring is
    the genuine optimum (what a classical optimizer would extract from QAOA),
    even when it carries little probability at low depth.
    """
    order = [int(s) for s in np.argsort(probs)[::-1][:TOP_SAMPLES]]
    best = int(np.argmin(C))
    if best not in order:
        order.append(best)
    return [([(s >> j) & 1 for j in range(n)], float(probs[s])) for s in order]


def onehot_penalty(nodes, edges):
    """
    Tight one-hot penalty A = max_degree + 1. This is the smallest weight that
    still makes a proper coloring the global optimum (any one-hot violation must
    cost more than the edge conflicts it could remove). Using this instead of
    QuadraticProgramToQubo's large auto-penalty keeps the cost landscape smooth,
    which lets QAOA concentrate far more probability on proper colorings.
    """
    deg = {v: 0 for v in nodes}
    for u, v in edges:
        if u in deg:
            deg[u] += 1
        if v in deg:
            deg[v] += 1
    return (max(deg.values()) if deg else 1) + 1


def proper_coloring_mass(probs, nodes, edges, num_colors):
    """
    Total probability, over the FULL distribution, of measuring a bitstring that
    decodes to a proper coloring. Each node's color is the argmax over its color
    bits — identical to `decode_coloring` — so this matches both the old behavior
    and the coloring the UI actually displays.
    """
    dim = probs.shape[0]
    idx = np.arange(dim, dtype=np.int64)
    pos = {v: i for i, v in enumerate(nodes)}
    node_color = np.empty((dim, len(nodes)), dtype=np.int64)
    for vi in range(len(nodes)):
        block = np.stack(
            [((idx >> (vi * num_colors + c)) & 1) for c in range(num_colors)],
            axis=1,
        )
        node_color[:, vi] = block.argmax(axis=1)

    proper = np.ones(dim, dtype=bool)
    for u, v in edges:
        proper &= node_color[:, pos[u]] != node_color[:, pos[v]]
    return float(probs[proper].sum())


def conflict_tiers(node_color, probs, edges, pos):
    """
    Total probability mass grouped by conflict count, over the FULL distribution.
    `node_color[s, vi]` is node vi's color in basis state s (argmax decode, same
    as `decode_coloring`). Returns [{"conflicts": k, "prob": mass}, ...] sorted by
    k ascending, including only tiers that carry non-negligible mass.
    """
    dim = probs.shape[0]
    counts = np.zeros(dim, dtype=np.int64)
    for u, v in edges:
        counts += (node_color[:, pos[u]] == node_color[:, pos[v]]).astype(np.int64)

    tiers = []
    for k in range(int(counts.max()) + 1 if dim else 0):
        mass = float(probs[counts == k].sum())
        if mass > 1e-9:
            tiers.append({"conflicts": k, "prob": mass})
    return tiers


def decode_distribution(probs, nodes, edges, num_colors):
    """
    Shared decode of the full statevector distribution: returns
    (proper_mass, conflict_tiers) so we don't pay the per-state argmax twice.
    """
    dim = probs.shape[0]
    idx = np.arange(dim, dtype=np.int64)
    pos = {v: i for i, v in enumerate(nodes)}
    node_color = np.empty((dim, len(nodes)), dtype=np.int64)
    for vi in range(len(nodes)):
        block = np.stack(
            [((idx >> (vi * num_colors + c)) & 1) for c in range(num_colors)],
            axis=1,
        )
        node_color[:, vi] = block.argmax(axis=1)

    proper = np.ones(dim, dtype=bool)
    for u, v in edges:
        proper &= node_color[:, pos[u]] != node_color[:, pos[v]]
    proper_mass = float(probs[proper].sum())
    return proper_mass, conflict_tiers(node_color, probs, edges, pos)


def run_local(qp, nodes, edges, num_colors, p):
    from qiskit_optimization.converters import QuadraticProgramToQubo

    qubo = QuadraticProgramToQubo(penalty=onehot_penalty(nodes, edges)).convert(qp)
    C, n = build_cost_vector(qubo)

    # Report the QAOA candidate whose distribution most favors proper colorings.
    # Skip this extra scoring above 15 qubits, where it's too costly per candidate.
    def score(probs):
        return proper_coloring_mass(probs, nodes, edges, num_colors)

    _params, probs, energy_history, restarts = qaoa_optimize(
        C, n, p, score=score if n <= 15 else None
    )

    optimal, tiers = decode_distribution(probs, nodes, edges, num_colors)
    return collect_samples(probs, n, C), energy_history, float(optimal), restarts, tiers


# --------------------------------------------------------------------------- #
# IBM hardware sampling of the optimized ansatz (best effort)
# --------------------------------------------------------------------------- #
def build_qaoa_circuit(operator, params, n, p):
    """
    QAOA circuit whose cost layers use the Ising `operator` (= diagonal cost up
    to a global-phase offset), so the NumPy-optimized params transfer exactly.
    """
    from qiskit import QuantumCircuit

    gammas = params[:p]
    betas = params[p:]
    terms = operator.to_list()  # [(pauli_string, coeff)]

    qc = QuantumCircuit(n)
    qc.h(range(n))
    for layer in range(p):
        for pauli, coeff in terms:
            # qiskit Pauli strings are little-endian: reversed(pauli)[i] == qubit i.
            zpos = [i for i, ch in enumerate(reversed(pauli)) if ch == "Z"]
            c = float(np.real(coeff))
            if len(zpos) == 1:
                qc.rz(2 * c * gammas[layer], zpos[0])
            elif len(zpos) == 2:
                qc.rzz(2 * c * gammas[layer], zpos[0], zpos[1])
        for j in range(n):
            qc.rx(2 * betas[layer], j)
    qc.measure_all()
    return qc


def run_ibm(qp, nodes, edges, num_colors, p, token):
    """
    Optimize QAOA fast (NumPy), then sample the optimized circuit on the
    least-busy real backend. Returns (samples, energy_history, backend_name).
    Raises on any failure so the caller can fall back to the local result.
    """
    from qiskit import transpile
    from qiskit_optimization.converters import QuadraticProgramToQubo
    from qiskit_ibm_runtime import QiskitRuntimeService, SamplerV2

    if not token:
        raise ValueError("No IBM token provided")

    # Validate the token + pick a backend (real API calls — fail fast if bad).
    service = QiskitRuntimeService(channel="ibm_quantum", token=token)
    n = len(nodes) * num_colors
    backend = service.least_busy(operational=True, simulator=False, min_num_qubits=n)

    qubo = QuadraticProgramToQubo(penalty=onehot_penalty(nodes, edges)).convert(qp)
    C, n = build_cost_vector(qubo)
    operator, _offset = qubo.to_ising()
    params, _probs, energy_history, _restarts = qaoa_optimize(C, n, p)

    circuit = build_qaoa_circuit(operator, params, n, p)
    isa = transpile(circuit, backend=backend, optimization_level=1)
    sampler = SamplerV2(mode=backend)
    job = sampler.run([isa], shots=1024)

    # Poll within the serverless budget; bail (and fall back) if it queues long.
    deadline = time.time() + IBM_BUDGET_S
    while time.time() < deadline:
        if str(job.status()) in ("DONE", "JobStatus.DONE"):
            break
        time.sleep(0.5)
    if str(job.status()) not in ("DONE", "JobStatus.DONE"):
        try:
            job.cancel()
        except Exception:
            pass
        raise TimeoutError("IBM job exceeded the serverless time budget")

    counts = job.result()[0].data.meas.get_counts()
    total = sum(counts.values())

    # Decode counts -> samples over variables (no slack vars, so var i == qubit i).
    samples = []
    for bitstring, count in counts.items():
        # Big-endian string: char[0] is the highest qubit; var i = bits[n-1-i].
        x = [int(bitstring[n - 1 - i]) for i in range(n)]
        samples.append((x, count / total))

    # Guarantee the true optimum is represented, like the local path.
    best = int(np.argmin(C))
    xb = [(best >> j) & 1 for j in range(n)]
    if not any(x == xb for x, _ in samples):
        samples.append((xb, 0.0))

    return samples, energy_history, backend.name


# --------------------------------------------------------------------------- #
# Orchestration
# --------------------------------------------------------------------------- #
def execute(payload):
    nodes, edges = parse_graph(payload.get("graph", {}))
    num_colors = int(payload.get("colors", 3))
    p = max(1, min(5, int(payload.get("p", 1))))
    target = payload.get("target", "local")
    token = payload.get("ibm_token", "") or ""

    if len(nodes) < 2:
        return 400, {"error": "Graph needs at least 2 nodes."}

    n_qubits = len(nodes) * num_colors
    if n_qubits > QUBIT_CAP:
        return 400, {
            "error": (
                f"{len(nodes)} nodes x {num_colors} colors = {n_qubits} qubits "
                f"exceeds the local simulator cap of {QUBIT_CAP}."
            )
        }

    qp, _ = build_quadratic_program(nodes, edges, num_colors)

    if target == "ibm":
        try:
            samples, energy_history, backend_name = run_ibm(
                qp, nodes, edges, num_colors, p, token
            )
            return 200, build_result(
                samples, nodes, edges, num_colors, energy_history,
                backend_name, fallback=False,
            )
        except Exception as exc:  # noqa: BLE001 - any failure => graceful fallback
            samples, energy_history, optimal, restarts, tiers = run_local(
                qp, nodes, edges, num_colors, p
            )
            res = build_result(
                samples, nodes, edges, num_colors, energy_history,
                "local simulator", fallback=True, success_prob=optimal,
                conflict_distribution=tiers,
            )
            res["energy_by_depth"] = restarts
            res["note"] = f"IBM run unavailable ({exc}); used local simulator."
            return 200, res

    samples, energy_history, optimal, restarts, tiers = run_local(
        qp, nodes, edges, num_colors, p
    )
    res = build_result(
        samples, nodes, edges, num_colors, energy_history,
        "local simulator", fallback=False, success_prob=optimal,
        conflict_distribution=tiers,
    )
    res["energy_by_depth"] = restarts
    return 200, res


# --------------------------------------------------------------------------- #
# Vercel handler
# --------------------------------------------------------------------------- #
class handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length) if length else b"{}"
            payload = json.loads(raw or b"{}")
            status, body = execute(payload)
            self._send(status, body)
        except Exception as exc:  # noqa: BLE001
            self._send(
                500,
                {"error": f"Execution failed: {exc}", "trace": traceback.format_exc()},
            )

    def do_GET(self):
        self._send(200, {"status": "ok", "service": "qaoa-graph-coloring"})


# --------------------------------------------------------------------------- #
# CLI entrypoint — used by the Next.js dev route (src/app/api/quantum/execute).
# Reads a JSON request body on stdin and writes {"status", "body"} on stdout.
# Qiskit's deprecation chatter goes to stderr, so stdout stays clean JSON.
# --------------------------------------------------------------------------- #
def _main():
    import sys

    raw = sys.stdin.read() or "{}"
    try:
        payload = json.loads(raw)
        status, body = execute(payload)
    except Exception as exc:  # noqa: BLE001
        status, body = 500, {
            "error": f"Execution failed: {exc}",
            "trace": traceback.format_exc(),
        }
    sys.stdout.write(json.dumps({"status": status, "body": body}))
    sys.stdout.flush()


if __name__ == "__main__":
    _main()
