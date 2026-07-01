@AGENTS.md

# VisualizeQuantum — project guide for agents

Interactive playground for visualizing quantum algorithms. The shipped module is
**Graph Coloring with QAOA**: build a graph, run a real Qiskit-derived QUBO on a
local NumPy statevector solver (or sample the optimized ansatz on IBM hardware),
and watch the optimization converge. See `README.md` for the full write-up.

## Commands

```bash
npm run dev      # Next.js dev server (http://localhost:3000)
npm run build    # production build
npm run lint     # eslint (flat config)
npx tsc --noEmit # type-check (strict)
```

The quantum backend is Python. Create `.venv` at the repo root and
`pip install -r requirements.txt` (Python 3.11/3.12). The API route auto-detects
`.venv/Scripts/python.exe` (Windows) or `.venv/bin/python`; override with
`PYTHON_BIN`. Run the solver directly for debugging:
`echo '{...request...}' | .venv/Scripts/python.exe python/execute.py`.

## Architecture

- **Plugin registry** — every algorithm is an `AlgorithmModule` (`src/modules/_types.ts`)
  registered in `src/modules/registry.ts`. The dashboard, sidebar, and dynamic
  route (`src/app/visualize/[algorithmId]/page.tsx`) read only from that list, so
  adding an algorithm = new `src/modules/<id>/` folder + one registry line.
  `grovers-search` is a disabled placeholder proving additivity.
- **Graph Coloring module** (`src/modules/graph-coloring/`):
  - `store.ts` — Zustand store: graph, params, run `status`/`runPhase`, and the
    `QaoaResult` shape (includes `conflict_distribution`).
  - `ConfigPanel.tsx` — inputs, Run/Stop (AbortController), feasibility warning.
  - `GraphBuilder.tsx` + `ForceGraphCanvas.tsx` — interactive `react-force-graph-2d`
    canvas (Add/Connect/Delete/Move, Center). Node positions live in an in-memory
    ref inside the canvas; **don't remount it** (e.g. no `key` that changes on
    interaction) or positions/pins are lost.
  - `useRunAnimation.ts` — the cinematic energy-driven color-settle animation.
  - `lib.ts` — pure graph helpers (`maxEdges`, `maxCliqueSize`, conflict checks).
  - `Visualizer.tsx` — colored graph + Recharts (`EnergyChart`, `ProbabilityBars`
    = Solution Quality Distribution).
- **Quantum backend** (`python/execute.py`) — builds the QUBO with
  qiskit-optimization, then a hand-written NumPy statevector QAOA (diagonal cost,
  COBYLA, INTERP warm-starts, default `p=3`). `src/app/api/quantum/execute/route.ts`
  spawns it locally in dev, or proxies to `QUANTUM_API_URL` when set (hosted).

## Conventions

- **Read the Next.js 16 docs in `node_modules/next/dist/docs/` before writing
  Next.js code** (see AGENTS.md) — this version differs from training data.
- TypeScript strict; keep `tsc --noEmit` and `npm run lint` clean.
- Statevector sim is exponential in `nodes × colors`; circuits are capped at
  **18 qubits** (`QUBIT_CAP`), enforced in both the backend and `ConfigPanel`.
- The backend prints only clean JSON on stdout (the Node route parses it); qiskit
  deprecation chatter goes to stderr. Don't add stray stdout prints.
