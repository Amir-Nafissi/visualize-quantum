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

`QuadraticProgramToQubo` folds the constraints into penalties, `.to_ising()`
produces the Hamiltonian, and **QAOA** (depth `p`, COBYLA optimizer, statevector
`Sampler`) minimizes it. The most probable bitstring is decoded back into a
coloring; conflicting edges are highlighted in red.

Validated end-to-end: a triangle is properly 3-colored (0 conflicts) but never
2-colored (≥1 conflict); a 4-cycle is properly 2-colored.

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
   Delete / Move modes on the canvas).
3. Pick colors (2–4), QAOA depth `p` (1–5), and target.
4. **Run QAOA** → colored graph, energy-convergence chart, top-5 bitstring bars.

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
- `requirements.txt` pins the **qiskit 1.x** line (QAOA uses the V1 primitives
  removed in qiskit 2.0). `qiskit-aer` is intentionally omitted — the local path
  uses the exact statevector `Sampler`, and dropping Aer keeps the bundle under
  Vercel's ~250 MB unzipped limit.
- Keep graphs small: local statevector simulation is exponential, so the app
  caps circuits at **18 qubits** (`nodes × colors`) and surfaces a clear error
  beyond that.
