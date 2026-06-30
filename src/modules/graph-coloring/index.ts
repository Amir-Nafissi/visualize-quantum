import { Palette } from "lucide-react";
import type { AlgorithmModule } from "../_types";
import { GraphColoringConfig } from "./GraphColoringConfig";
import { Visualizer } from "./Visualizer";

/**
 * Milestone 1 — Graph Coloring via QAOA. Self-contained plugin: the framework
 * only consumes this exported `AlgorithmModule`.
 */
export const graphColoringModule: AlgorithmModule = {
  id: "graph-coloring",
  name: "Graph Coloring",
  description:
    "Color a graph so no two adjacent nodes share a color, solved with QAOA.",
  icon: Palette,
  ConfigComponent: GraphColoringConfig,
  VisualizerComponent: Visualizer,
  defaultParams: {
    colors: 3,
    p: 3,
    target: "local",
  },
  enabled: true,
};
