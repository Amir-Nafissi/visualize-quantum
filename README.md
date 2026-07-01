# VisualizeQuantum

An interactive, **modular** playground for visualizing quantum algorithms.
Milestone 1 ships **Graph Coloring with QAOA** (Quantum Approximate Optimization
Algorithm) — build a graph, run a real Qiskit circuit on a local simulator or
IBM Quantum hardware, and watch the optimization converge.

The whole app is built around a small plugin contract so future algorithms
(Grover's Search, VQE, …) drop in as self-contained modules without touching the
core framework.

---

## Stack

| Layer        | Choice                                                        |
| ------------ | ------------------------------------------------------------- |
| Framework    | Next.js (App Router, TypeScript, strict)                      |
| Styling      | Tailwind CSS v4 + shadcn-style primitives on Radix            |
| Animation    | Framer Motion                                                 |
| Graph canvas | `react-force-graph-2d` (force-directed, interactive)          |
| Charts       | Recharts                                                      |
| State        | Zustand                                                       |
| Quantum      | Python serverless fn (`qiskit`, `qiskit-optimization`, QAOA)  |

## The plugin architecture

```
src/modules/
  _types.ts        # AlgorithmModule interface — the entire contract
  registry.ts      # the ONLY place modules are registered
  graph-coloring/  # Milestone 1 (this module)
  grovers-search/  # Milestone 2 placeholder (disabled, proves additivity)
```

An `AlgorithmModule` is just:

```ts
interface AlgorithmModule {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  ConfigComponent: React.ComponentType;     // inputs (graph builder + params)
  VisualizerComponent: React.ComponentType; // outputs (graph + charts)
  defaultParams: Record<string, unknown>;
  enabled: boolean;
}
```

The dashboard, sidebar, and dynamic route (`/visualize/[algorithmId]`) read only
from `registry.ts`. **Adding an algorithm = add a folder + one registry line.**

## How the quantum part works (no mocked math)

For a graph `G = (V, E)` and `k` colors we introduce one binary variable
`x[v,c] = 1` iff node `v` takes color `c`, then build a `QuadraticProgram`:

- **Objective** — minimize monochromatic edges:
  `Σ_(u,v)∈E Σ_c x[u,c]·x[v,c]`
- **Constraint** — exactly one color per node: `Σ_c x[v,c] = 1`

`QuadraticProgramToQubo` (qiskit-optimization) folds the constraints into
penalties. Because the resulting cost Hamiltonian is **diagonal**, the local run
uses a fast hand-written **NumPy statevector QAOA** (depth `p`, COBYLA): it
precomputes the cost of every basis state once, then each optimizer step is a few
vectorized array ops — orders of magnitude faster than driving a qiskit primitive
over all 2ⁿ outcomes per iteration, and still mathematically exact (no shot
noise). The genuine cost-minimum coloring is reported; conflicting edges are
highlighted in red.

Validated end-to-end: a triangle is properly 3-colored (0 conflicts) but never
2-colored (≥1 conflict); a 4-cycle is properly 2-colored.

The backend also returns, over the **full** measurement distribution, the
probability mass grouped by conflict count (`conflict_distribution`) — this
drives the Solution Quality Distribution chart. This is more informative than
raw bitstring bars: every proper coloring is cost-degenerate (all have zero
conflicts), so QAOA spreads near-equal probability over them and per-bitstring
bars come out uniform, whereas the conflict tiers show a clear success-vs-error
profile.

## Local development

The Qiskit logic lives in `python/execute.py`. A Next.js route handler
(`src/app/api/quantum/execute/route.ts`) owns the `/api/quantum/execute`
endpoint and, in development, runs that script through your local Python venv —
so **plain `npm run dev` works**, no `vercel dev` required.

```bash
# 1. JS deps
npm install

# 2. Python deps in a virtualenv (Python 3.11 or 3.12)
python -m venv .venv
.venv/Scripts/activate          # Windows
# source .venv/bin/activate     # macOS/Linux
pip install -r requirements.txt

# 3. Run the app
npm run dev                     # http://localhost:3000
```

The route finds the interpreter automatically (`.venv/Scripts/python.exe` on
Windows, `.venv/bin/python` elsewhere); override it with the `PYTHON_BIN`
environment variable if your Python lives somewhere else.

Then open the dashboard → **Graph Coloring**:

1. Set nodes/edges (edge max auto-updates to `N·(N−1)/2` and clamps down).
2. **Generate** a random Erdős–Rényi graph, or build one by hand (Add / Connect /
   Delete / Move modes on the canvas). Hand-placed nodes stay pinned where you
   drop them, positions survive tool switches, and **Center** re-fits the graph
   in view.
3. Pick colors (2–4), QAOA depth `p` (1–5), and target. If the chosen color count
   is below the graph's chromatic lower bound (largest clique) the panel warns
   that some edges must conflict — e.g. a complete graph on `n` nodes needs `n`
   colors.
4. **Run QAOA** → colored graph, energy-convergence chart, and a Solution Quality
   Distribution chart (probability mass by conflict count; the 0-conflicts
   success bar is green). A long run can be cancelled with **Stop**.

## IBM Quantum

Select **IBM Quantum**, paste your API token (optionally saved to LocalStorage).
The optimization runs classically; the optimized ansatz is then sampled on the
least-busy real backend. A missing/invalid token or a queue longer than the
serverless budget **gracefully falls back to the local simulator** (you'll get a
toast), so the app never hard-fails on a quantum job.

## Deployment notes

- The Node route runs Qiskit by spawning local Python, which works in dev and in
  any Node host that has Python + the requirements available. On Vercel's managed
  Node runtime (no Python), set **`QUANTUM_API_URL`** to a deployed Python
  service and the route proxies requests to it; `python/execute.py` also exposes
  a Vercel-style `handler`, so it can be deployed as a standalone Python function.
- `vercel.json` sets the route's `memory` / `maxDuration`.
- `requirements.txt` pins the **qiskit 1.x** line and omits `qiskit-algorithms`
  and `qiskit-aer` — the local solver is pure NumPy/SciPy, so only
  qiskit-optimization (QUBO) and qiskit-ibm-runtime (hardware) are needed. This
  keeps the bundle well under Vercel's ~250 MB unzipped limit.
- QAOA depth defaults to **p=3** with layerwise (INTERP) initialization —
  optimize p=1, then warm-start each deeper layer from the previous solution — so
  deeper circuits reliably improve. The reported candidate is chosen to maximize
  proper-coloring probability mass.
- Keep graphs small: statevector simulation is exponential in `nodes × colors`,
  so the app caps circuits at **18 qubits** and surfaces a clear error beyond
  that. Typical graphs (≤15 qubits) solve in ~5–7 s; the 18-qubit max ~11 s.
