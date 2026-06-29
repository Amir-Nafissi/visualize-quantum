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
import time
import traceback

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
def build_result(samples, nodes, edges, num_colors, energy_history, backend, fallback):
    """
    samples: list of (x:list[float over variables], probability:float).
    Picks the best (fewest conflicts, then most probable) sample as the coloring
    and reports success probability + top-5 bitstrings.
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

    # Success probability = mass on solutions with the minimum conflict count.
    min_conf = min(t[3] for t in scored)
    success_prob = sum(t[2] for t in scored if t[3] == min_conf)

    top = [{"bits": t[0], "prob": t[2]} for t in scored[:5]]

    return {
        "coloring": {str(k): v for k, v in coloring.items()},
        "energy_history": energy_history,
        "success_prob": float(success_prob),
        "top_bitstrings": top,
        "num_colors": num_colors,
        "conflicts": int(best_conflicts),
        "backend": backend,
        "fallback": fallback,
        "qubits": n,
    }


# --------------------------------------------------------------------------- #
# Local QAOA via MinimumEigenOptimizer (correct, exact decode)
# --------------------------------------------------------------------------- #
def run_local(qp, nodes, edges, num_colors, p):
    from qiskit.primitives import Sampler
    from qiskit_algorithms import QAOA
    from qiskit_algorithms.optimizers import COBYLA
    from qiskit_optimization.algorithms import MinimumEigenOptimizer

    energy_history = []

    def callback(eval_count, params, mean, metadata):
        energy_history.append(float(mean))

    qaoa = QAOA(
        sampler=Sampler(),
        optimizer=COBYLA(maxiter=100),
        reps=p,
        callback=callback,
    )
    meo = MinimumEigenOptimizer(qaoa)
    result = meo.solve(qp)

    samples = [(list(s.x), float(s.probability)) for s in result.samples]
    if not samples:
        samples = [(list(result.x), 1.0)]

    return samples, energy_history


# --------------------------------------------------------------------------- #
# IBM hardware sampling of the optimized ansatz (best effort)
# --------------------------------------------------------------------------- #
def run_ibm(qp, nodes, edges, num_colors, p, token):
    """
    Optimize QAOA classically, then sample the optimized circuit on the
    least-busy real backend. Returns (samples, energy_history, backend_name).
    Raises on any failure so the caller can fall back to the local result.
    """
    from qiskit.primitives import Sampler
    from qiskit_algorithms import QAOA
    from qiskit_algorithms.optimizers import COBYLA
    from qiskit_optimization.converters import QuadraticProgramToQubo
    from qiskit_ibm_runtime import QiskitRuntimeService, SamplerV2

    if not token:
        raise ValueError("No IBM token provided")

    # Validate the token + pick a backend (real API calls — fail fast if bad).
    service = QiskitRuntimeService(channel="ibm_quantum", token=token)
    n = len(nodes) * num_colors
    backend = service.least_busy(operational=True, simulator=False, min_num_qubits=n)

    conv = QuadraticProgramToQubo()
    qubo = conv.convert(qp)
    operator, _offset = qubo.to_ising()

    energy_history = []

    def callback(eval_count, params, mean, metadata):
        energy_history.append(float(mean))

    qaoa = QAOA(
        sampler=Sampler(), optimizer=COBYLA(maxiter=100), reps=p, callback=callback
    )
    eig = qaoa.compute_minimum_eigenvalue(operator)

    # Bind the optimal parameters and add measurements.
    circuit = eig.optimal_circuit.assign_parameters(eig.optimal_parameters)
    circuit.measure_all()

    from qiskit import transpile

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

    # Decode counts -> samples over QUBO variables (== original one-hot vars).
    samples = []
    for bitstring, count in counts.items():
        # Big-endian string: char[0] is the highest qubit; var i = bits[n-1-i].
        x = [int(bitstring[n - 1 - i]) for i in range(n)]
        x_orig = conv.interpret(x)
        samples.append((list(x_orig), count / total))

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
            samples, energy_history = run_local(qp, nodes, edges, num_colors, p)
            res = build_result(
                samples, nodes, edges, num_colors, energy_history,
                "local simulator", fallback=True,
            )
            res["note"] = f"IBM run unavailable ({exc}); used local simulator."
            return 200, res

    samples, energy_history = run_local(qp, nodes, edges, num_colors, p)
    return 200, build_result(
        samples, nodes, edges, num_colors, energy_history,
        "local simulator", fallback=False,
    )


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
