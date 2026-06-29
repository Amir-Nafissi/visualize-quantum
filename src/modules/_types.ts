import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * The core plugin contract. Every quantum-algorithm visualizer in the app is
 * described by one `AlgorithmModule`. The framework (dashboard, sidebar, dynamic
 * route) only ever touches this interface — adding a new algorithm means adding a
 * folder under `src/modules/<id>/` and registering it in `registry.ts`. Nothing
 * in the core framework needs to change.
 */
export interface AlgorithmModule {
  /** URL-safe unique identifier, e.g. "graph-coloring". */
  id: string;
  /** Human-readable name shown in the sidebar / dashboard. */
  name: string;
  /** Short one-line description for cards and headers. */
  description: string;
  /** Icon rendered in navigation. */
  icon: LucideIcon;
  /** Left-hand configuration & input UI (graph builder, params, run button). */
  ConfigComponent: ComponentType;
  /** Right-hand results UI (charts, colored graph, probabilities). */
  VisualizerComponent: ComponentType;
  /** Default parameter values used to seed the module's state. */
  defaultParams: Record<string, unknown>;
  /** When false the module renders as a "coming soon" placeholder. */
  enabled: boolean;
}
