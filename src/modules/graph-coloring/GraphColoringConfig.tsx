"use client";

import { Settings2 } from "lucide-react";
import { GraphBuilder } from "./GraphBuilder";
import { ConfigPanel } from "./ConfigPanel";

/**
 * The full input surface for the graph-coloring module: the interactive graph
 * builder/generator on top, the QAOA configuration + run controls below. This is
 * what the framework mounts as the module's `ConfigComponent`.
 */
export function GraphColoringConfig() {
  return (
    <div className="space-y-5">
      <GraphBuilder />

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Settings2 className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">QAOA configuration</h3>
        </div>
        <ConfigPanel />
      </div>
    </div>
  );
}
