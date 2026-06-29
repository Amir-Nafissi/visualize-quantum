"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { MousePointer2, Plus, Spline, Trash2, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useGraphColoringStore } from "./store";
import { conflictingEdges, edgeKey, maxEdges } from "./lib";
import type { CanvasMode } from "./ForceGraphCanvas";

// react-force-graph touches `window`; load it only on the client.
const ForceGraphCanvas = dynamic(() => import("./ForceGraphCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
      Loading canvas…
    </div>
  ),
});

const MODES: { id: CanvasMode; label: string; icon: typeof Plus }[] = [
  { id: "move", label: "Move", icon: MousePointer2 },
  { id: "add", label: "Add node", icon: Plus },
  { id: "connect", label: "Connect", icon: Spline },
  { id: "delete", label: "Delete", icon: Trash2 },
];

const MODE_HINTS: Record<CanvasMode, string> = {
  move: "Drag nodes to rearrange the layout.",
  add: "Click any empty space to drop a new node.",
  connect: "Click two nodes (or drag between them) to link them.",
  delete: "Click a node or an edge to remove it.",
};

export function GraphBuilder() {
  const {
    numNodes,
    numEdges,
    graph,
    result,
    setNumNodes,
    setNumEdges,
    regenerate,
    addNode,
    addEdge,
    removeNode,
    removeEdge,
  } = useGraphColoringStore();

  const [mode, setMode] = useState<CanvasMode>("move");

  const edgeCap = maxEdges(numNodes);

  const conflicts = useMemo(() => {
    if (!result) return new Set<string>();
    return new Set(
      conflictingEdges(graph.edges, result.coloring).map((e) =>
        edgeKey(e.source, e.target)
      )
    );
  }, [result, graph.edges]);

  return (
    <div className="flex flex-col gap-4">
      {/* Random graph generator */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Random graph generator</h3>
          <Button size="sm" onClick={regenerate} className="gap-1.5">
            <Shuffle className="size-3.5" />
            Generate
          </Button>
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Number of nodes</Label>
              <span className="font-mono text-sm text-muted-foreground">
                {numNodes}
              </span>
            </div>
            <Slider
              value={[numNodes]}
              min={3}
              max={10}
              step={1}
              onValueChange={([v]) => setNumNodes(v)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Number of edges</Label>
              <span className="font-mono text-sm text-muted-foreground">
                {numEdges}
                <span className="text-muted-foreground/50"> / {edgeCap}</span>
              </span>
            </div>
            <Slider
              value={[numEdges]}
              min={0}
              max={edgeCap}
              step={1}
              onValueChange={([v]) => setNumEdges(v)}
            />
            <p className="text-xs text-muted-foreground/70">
              Max edges = N·(N−1)/2 = {edgeCap}
            </p>
          </div>
        </div>
      </div>

      {/* Interactive canvas */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border p-3">
          <div className="flex items-center gap-1">
            {MODES.map((m) => {
              const Icon = m.icon;
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <Icon className="size-3.5" />
                  {m.label}
                </button>
              );
            })}
          </div>
          <span className="hidden text-xs text-muted-foreground/70 sm:block">
            {MODE_HINTS[mode]}
          </span>
        </div>

        <motion.div
          key={mode}
          initial={{ opacity: 0.6 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className={cn(
            "bg-grid h-[440px] w-full overflow-hidden rounded-b-xl",
            mode === "add" && "cursor-crosshair",
            mode === "delete" && "cursor-not-allowed"
          )}
        >
          <ForceGraphCanvas
            graph={graph}
            coloring={result?.coloring ?? null}
            conflicts={conflicts}
            mode={mode}
            onAddNodeAt={() => addNode()}
            onConnect={addEdge}
            onDeleteNode={removeNode}
            onDeleteEdge={removeEdge}
          />
        </motion.div>
      </div>
    </div>
  );
}
