import { Search } from "lucide-react";
import type { AlgorithmModule } from "../_types";
import { ComingSoon } from "@/components/layout/ComingSoon";

/**
 * Milestone 2 placeholder — Grover's Search. Disabled for now; it demonstrates
 * that registering a new algorithm is purely additive: drop a folder here, add
 * one entry to the registry, and the framework renders it. No core edits needed.
 */
export const groversSearchModule: AlgorithmModule = {
  id: "grovers-search",
  name: "Grover's Search",
  description: "Quantum search over an unstructured database. (Coming soon)",
  icon: Search,
  ConfigComponent: ComingSoon,
  VisualizerComponent: ComingSoon,
  defaultParams: {},
  enabled: false,
};
