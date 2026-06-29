"use client";

import { create } from "zustand";
import {
  generateRandomGraph,
  maxEdges,
  type Coloring,
  type Edge,
  type Graph,
} from "./lib";

export type ExecutionTarget = "local" | "ibm";
export type RunStatus = "idle" | "running" | "done" | "error";

/**
 * Drives the cinematic run animation, independent of the network `status`:
 *  - "superposition": Run clicked, rapid random color cycling while the API runs.
 *  - "settling": result arrived, replaying the energy-driven collapse.
 *  - "revealed": animation finished, final coloring + charts shown.
 */
export type RunPhase = "idle" | "superposition" | "settling" | "revealed";

/** One probability entry for a measured bitstring. */
export interface BitstringProb {
  bits: string;
  prob: number;
}

/** Shape returned by POST /api/quantum/execute. */
export interface QaoaResult {
  coloring: Coloring;
  energy_history: number[];
  success_prob: number;
  top_bitstrings: BitstringProb[];
  num_colors: number;
  fallback?: boolean;
  backend?: string;
}

interface GraphColoringState {
  // Generator slider state
  numNodes: number;
  numEdges: number;

  // The working graph (shared by generator + interactive canvas)
  graph: Graph;

  // Algorithm configuration
  colors: number;
  p: number;
  target: ExecutionTarget;
  ibmToken: string;
  saveToken: boolean;

  // Execution state
  status: RunStatus;
  runPhase: RunPhase;
  result: QaoaResult | null;
  error: string | null;

  // --- actions ---
  setNumNodes: (n: number) => void;
  setNumEdges: (m: number) => void;
  regenerate: () => void;
  setGraph: (graph: Graph) => void;
  addNode: () => number;
  addEdge: (source: number, target: number) => void;
  removeNode: (id: number) => void;
  removeEdge: (source: number, target: number) => void;

  setColors: (c: number) => void;
  setP: (p: number) => void;
  setTarget: (t: ExecutionTarget) => void;
  setIbmToken: (token: string) => void;
  setSaveToken: (save: boolean) => void;

  setStatus: (s: RunStatus) => void;
  setRunPhase: (p: RunPhase) => void;
  setResult: (r: QaoaResult | null) => void;
  setError: (e: string | null) => void;
  reset: () => void;
}

const INITIAL_NODES = 5;
const INITIAL_EDGES = 6;

export const useGraphColoringStore = create<GraphColoringState>((set, get) => ({
  numNodes: INITIAL_NODES,
  numEdges: INITIAL_EDGES,
  graph: generateRandomGraph(INITIAL_NODES, INITIAL_EDGES),

  colors: 3,
  p: 1,
  target: "local",
  ibmToken: "",
  saveToken: false,

  status: "idle",
  runPhase: "idle",
  result: null,
  error: null,

  setNumNodes: (n) =>
    set((state) => {
      // Clamp the edge count down if it now exceeds the new feasible maximum.
      const cap = maxEdges(n);
      const numEdges = Math.min(state.numEdges, cap);
      return { numNodes: n, numEdges };
    }),

  setNumEdges: (m) =>
    set((state) => ({ numEdges: Math.min(m, maxEdges(state.numNodes)) })),

  regenerate: () =>
    set((state) => ({
      graph: generateRandomGraph(state.numNodes, state.numEdges),
      // A fresh graph invalidates any previous result.
      result: null,
      status: "idle",
      runPhase: "idle",
      error: null,
    })),

  setGraph: (graph) =>
    set({ graph, result: null, status: "idle", runPhase: "idle", error: null }),

  addNode: () => {
    const { graph } = get();
    const nextId = graph.nodes.length
      ? Math.max(...graph.nodes) + 1
      : 0;
    set({
      graph: { nodes: [...graph.nodes, nextId], edges: graph.edges },
      numNodes: graph.nodes.length + 1,
      result: null,
      status: "idle",
      runPhase: "idle",
    });
    return nextId;
  },

  addEdge: (source, target) =>
    set((state) => {
      if (source === target) return state;
      const exists = state.graph.edges.some(
        (e) =>
          (e.source === source && e.target === target) ||
          (e.source === target && e.target === source)
      );
      if (exists) return state;
      const edges: Edge[] = [...state.graph.edges, { source, target }];
      return {
        graph: { nodes: state.graph.nodes, edges },
        numEdges: edges.length,
        result: null,
        status: "idle",
        runPhase: "idle",
      };
    }),

  removeNode: (id) =>
    set((state) => {
      const nodes = state.graph.nodes.filter((n) => n !== id);
      const edges = state.graph.edges.filter(
        (e) => e.source !== id && e.target !== id
      );
      return {
        graph: { nodes, edges },
        numNodes: nodes.length,
        numEdges: edges.length,
        result: null,
        status: "idle",
        runPhase: "idle",
      };
    }),

  removeEdge: (source, target) =>
    set((state) => {
      const edges = state.graph.edges.filter(
        (e) =>
          !(
            (e.source === source && e.target === target) ||
            (e.source === target && e.target === source)
          )
      );
      return {
        graph: { nodes: state.graph.nodes, edges },
        numEdges: edges.length,
        result: null,
        status: "idle",
        runPhase: "idle",
      };
    }),

  setColors: (c) => set({ colors: c, result: null, runPhase: "idle" }),
  setP: (p) => set({ p }),
  setTarget: (t) => set({ target: t }),
  setIbmToken: (ibmToken) => set({ ibmToken }),
  setSaveToken: (saveToken) => set({ saveToken }),

  setStatus: (status) => set({ status }),
  setRunPhase: (runPhase) => set({ runPhase }),
  setResult: (result) => set({ result }),
  setError: (error) => set({ error }),
  reset: () =>
    set({ status: "idle", runPhase: "idle", result: null, error: null }),
}));
