/**
 * Classical graph-coloring solver — the non-quantum baseline for the
 * "Classical Algorithm" execution target. Runs entirely in the browser (pure
 * functions, no React/DOM deps beyond `performance.now()`), so it's instant.
 *
 *   - ≤ 15 nodes: exact backtracking with branch-and-bound. Finds a proper
 *     (0-conflict) coloring if one exists, otherwise the minimum-conflict one.
 *   - > 15 nodes: DSatur greedy heuristic — fast, proper when the graph is
 *     k-colorable, otherwise a low-conflict approximation.
 *
 * Kept separate from the quantum code; returns a plain result the store/visualizer
 * can consume alongside `QaoaResult`.
 */

import { conflictingEdges, type Coloring, type Graph } from "./lib";

export type ClassicalAlgorithm = "backtracking" | "greedy";

export interface ClassicalSolution {
  /** node id -> color index (same shape as the backend `coloring`). */
  coloring: Coloring;
  /** Monochromatic edges in the returned coloring (0 = proper). */
  conflicts: number;
  algorithm: ClassicalAlgorithm;
  executionTimeMs: number;
}

/** Above this node count the exact search is too slow; fall back to greedy. */
const EXACT_MAX_NODES = 15;

/** Build an undirected adjacency map (node id -> neighbor ids). */
function buildAdjacency(graph: Graph): Map<number, number[]> {
  const adj = new Map<number, number[]>();
  for (const v of graph.nodes) adj.set(v, []);
  for (const e of graph.edges) {
    if (e.source === e.target) continue;
    adj.get(e.source)?.push(e.target);
    adj.get(e.target)?.push(e.source);
  }
  return adj;
}

/**
 * Exact backtracking that minimizes conflicts. Colors nodes in a fixed order,
 * counting how many already-colored neighbors each choice conflicts with, and
 * prunes any branch whose partial conflict count already reaches the best full
 * solution found so far. Returns as soon as a 0-conflict coloring is found.
 */
function solveBacktracking(
  graph: Graph,
  numColors: number,
  adj: Map<number, number[]>
): { coloring: Coloring; conflicts: number } {
  const order = graph.nodes;
  const assigned: Coloring = {};
  let best: Coloring = {};
  let bestConflicts = Infinity;

  const conflictsWith = (node: number, color: number): number => {
    let c = 0;
    for (const nb of adj.get(node) ?? []) {
      if (assigned[nb] === color) c++;
    }
    return c;
  };

  const recurse = (i: number, running: number): void => {
    if (running >= bestConflicts) return; // branch-and-bound prune
    if (i === order.length) {
      bestConflicts = running;
      best = { ...assigned };
      return;
    }
    const node = order[i];
    for (let color = 0; color < numColors; color++) {
      const added = conflictsWith(node, color);
      assigned[node] = color;
      recurse(i + 1, running + added);
      delete assigned[node];
      if (bestConflicts === 0) return; // found a proper coloring; done
    }
  };

  recurse(0, 0);
  return { coloring: best, conflicts: bestConflicts };
}

/**
 * DSatur greedy: repeatedly color the uncolored node with the highest saturation
 * (number of distinct colors among its neighbors), tie-broken by degree. Picks
 * the smallest color unused by neighbors, or — if all colors are taken — the one
 * that adds the fewest conflicts.
 */
function solveDSatur(
  graph: Graph,
  numColors: number,
  adj: Map<number, number[]>
): Coloring {
  const coloring: Coloring = {};
  const degree = new Map<number, number>();
  for (const v of graph.nodes) degree.set(v, (adj.get(v) ?? []).length);

  const uncolored = new Set(graph.nodes);
  while (uncolored.size > 0) {
    // Pick the most-saturated uncolored node (tie-break: highest degree).
    let pick = -1;
    let bestSat = -1;
    let bestDeg = -1;
    for (const v of uncolored) {
      const neighborColors = new Set<number>();
      for (const nb of adj.get(v) ?? []) {
        if (coloring[nb] !== undefined) neighborColors.add(coloring[nb]);
      }
      const sat = neighborColors.size;
      const deg = degree.get(v) ?? 0;
      if (sat > bestSat || (sat === bestSat && deg > bestDeg)) {
        bestSat = sat;
        bestDeg = deg;
        pick = v;
      }
    }

    // Count neighbor usage per color; choose an unused color, else the least-used.
    const usage = new Array<number>(numColors).fill(0);
    for (const nb of adj.get(pick) ?? []) {
      const c = coloring[nb];
      if (c !== undefined && c < numColors) usage[c]++;
    }
    let chosen = 0;
    for (let c = 0; c < numColors; c++) {
      if (usage[c] < usage[chosen]) chosen = c;
      if (usage[chosen] === 0) break;
    }
    coloring[pick] = chosen;
    uncolored.delete(pick);
  }
  return coloring;
}

/** Solve graph coloring classically, picking the algorithm by graph size. */
export function solveClassical(graph: Graph, numColors: number): ClassicalSolution {
  const start = performance.now();
  const adj = buildAdjacency(graph);

  let coloring: Coloring;
  let algorithm: ClassicalAlgorithm;
  if (graph.nodes.length <= EXACT_MAX_NODES) {
    ({ coloring } = solveBacktracking(graph, numColors, adj));
    algorithm = "backtracking";
  } else {
    coloring = solveDSatur(graph, numColors, adj);
    algorithm = "greedy";
  }

  const conflicts = conflictingEdges(graph.edges, coloring).length;
  const executionTimeMs = performance.now() - start;
  return { coloring, conflicts, algorithm, executionTimeMs };
}
