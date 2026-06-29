/**
 * Pure graph helpers for the graph-coloring module: data model, the dynamic
 * max-edge formula, an Erdős–Rényi G(n, m) generator, and coloring validation.
 * Everything here is deterministic/serializable and has no React/DOM deps.
 */

export interface Edge {
  source: number;
  target: number;
}

export interface Graph {
  /** Node ids, always 0..n-1 contiguous for generated graphs. */
  nodes: number[];
  edges: Edge[];
}

/** Maximum number of edges in a simple undirected graph on `n` nodes. */
export function maxEdges(n: number): number {
  return (n * (n - 1)) / 2;
}

/** Canonical key for an undirected edge (order-independent). */
export function edgeKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** True if the edge already exists (undirected) in the list. */
export function hasEdge(edges: Edge[], a: number, b: number): boolean {
  const key = edgeKey(a, b);
  return edges.some((e) => edgeKey(e.source, e.target) === key);
}

/**
 * Erdős–Rényi G(n, m): generate a simple undirected graph with exactly `n`
 * nodes and `m` distinct edges (no self-loops, no duplicates), chosen uniformly
 * at random. `m` is clamped to the feasible range [0, n*(n-1)/2].
 */
export function generateRandomGraph(n: number, m: number): Graph {
  const nodes = Array.from({ length: n }, (_, i) => i);
  const cap = maxEdges(n);
  const target = Math.max(0, Math.min(m, cap));

  // Build the full pool of candidate edges, then partial Fisher–Yates shuffle
  // and take the first `target`. Uniform selection of an m-edge graph.
  const pool: Edge[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      pool.push({ source: i, target: j });
    }
  }
  for (let i = 0; i < target; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return { nodes, edges: pool.slice(0, target) };
}

/** A node-id -> color-index assignment returned by the backend. */
export type Coloring = Record<number, number>;

/**
 * Returns the list of edges whose endpoints share the same color (the coloring
 * conflicts). An empty array means the coloring is proper.
 */
export function conflictingEdges(edges: Edge[], coloring: Coloring): Edge[] {
  return edges.filter((e) => {
    const cs = coloring[e.source];
    const ct = coloring[e.target];
    return cs !== undefined && ct !== undefined && cs === ct;
  });
}

/** Distinct palette for up to 4 colors, kept in sync with the backend indices. */
export const COLOR_PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#ec4899"];

/** Color for an uncolored node (before a run). */
export const UNCOLORED = "#52525b";
