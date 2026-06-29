import type { AlgorithmModule } from "./_types";
import { graphColoringModule } from "./graph-coloring";
import { groversSearchModule } from "./grovers-search";

/**
 * The single registration point for every algorithm module. To add an algorithm,
 * create `modules/<id>/` exporting an `AlgorithmModule` and append it here — the
 * dashboard, sidebar, and dynamic route all read from this list, so nothing else
 * in the framework needs to change.
 */
export const algorithmModules: AlgorithmModule[] = [
  graphColoringModule,
  groversSearchModule,
];

/** Look up a module by its id (used by the dynamic route). */
export function getModule(id: string): AlgorithmModule | undefined {
  return algorithmModules.find((m) => m.id === id);
}
