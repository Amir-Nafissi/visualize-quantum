"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, {
  type ForceGraphMethods,
  type NodeObject,
  type LinkObject,
} from "react-force-graph-2d";
import {
  COLOR_PALETTE,
  UNCOLORED,
  edgeKey,
  type Coloring,
  type Graph,
} from "./lib";

export type CanvasMode = "move" | "add" | "connect" | "delete";

interface NodeExtra {
  id: number;
}
type FGNode = NodeObject<NodeExtra>;
type FGLink = LinkObject<NodeExtra>;

interface ForceGraphCanvasProps {
  graph: Graph;
  coloring: Coloring | null;
  conflicts: Set<string>;
  mode: CanvasMode;
  onAddNodeAt: (x: number, y: number) => void;
  onConnect: (a: number, b: number) => void;
  onDeleteNode: (id: number) => void;
  onDeleteEdge: (a: number, b: number) => void;
  /** Per-frame color override (node id -> color index) during run animation. */
  colorIndexRef?: React.MutableRefObject<Map<number, number> | null>;
  /** Keep the canvas redrawing every frame so the color override animates. */
  continuousRedraw?: boolean;
  /** Set to a function that pans/zooms to fit the whole graph in view. */
  centerRef?: React.MutableRefObject<(() => void) | null>;
}

const CONNECT_RADIUS = 16; // graph-space distance to snap a drag to a node

/** Resolve either an id or a node object to its numeric id. */
function endpointId(end: FGLink["source"]): number {
  if (typeof end === "object" && end !== null) {
    return (end as FGNode).id as number;
  }
  return end as number;
}

export default function ForceGraphCanvas({
  graph,
  coloring,
  conflicts,
  mode,
  onAddNodeAt,
  onConnect,
  onDeleteNode,
  onDeleteEdge,
  colorIndexRef,
  continuousRedraw = false,
  centerRef,
}: ForceGraphCanvasProps) {
  const fgRef = useRef<ForceGraphMethods<FGNode, FGLink> | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 600, height: 440 });

  // Persistent node objects so force-layout positions survive re-renders.
  const nodeMap = useRef<Map<number, FGNode>>(new Map());
  // Where a freshly-added node should spawn (set right before onAddNodeAt).
  const pendingSpawn = useRef<{ x: number; y: number } | null>(null);
  // Drag bookkeeping for connect-by-drag.
  const dragStart = useRef<{ id: number; x: number; y: number } | null>(null);
  // Click-to-connect source selection (re-rendered via state). Only meaningful
  // in connect mode — derived below so switching modes can't leave it dangling.
  const [selected, setSelected] = useState<number | null>(null);
  const activeSelected = mode === "connect" ? selected : null;

  // Track container size for a responsive canvas.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setDims({ width: r.width, height: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Expose a "fit the whole graph in view" action to the parent toolbar.
  useEffect(() => {
    if (!centerRef) return;
    centerRef.current = () => fgRef.current?.zoomToFit(400, 40);
    return () => {
      centerRef.current = null;
    };
  }, [centerRef]);

  // Reconcile store graph -> persistent FG graph data, preserving positions.
  // react-force-graph mutates node objects in place (x/y/vx/vy/fx/fy) and keys
  // them by identity, so the persistent map *must* be read and updated here as
  // the graph prop changes — otherwise the layout resets every render. This is
  // the library's intended pattern; the React Compiler's render-phase ref rule
  // doesn't model it, so it's scoped-off for just this reconciliation.
  /* eslint-disable react-hooks/refs */
  const graphData = useMemo(() => {
    const map = nodeMap.current;
    const liveIds = new Set(graph.nodes);
    for (const id of map.keys()) {
      if (!liveIds.has(id)) map.delete(id);
    }
    const nodes: FGNode[] = graph.nodes.map((id) => {
      let n = map.get(id);
      if (!n) {
        n = { id };
        if (pendingSpawn.current) {
          n.x = pendingSpawn.current.x;
          n.y = pendingSpawn.current.y;
          pendingSpawn.current = null;
        }
        map.set(id, n);
      }
      return n;
    });
    const links: FGLink[] = graph.edges.map((e) => ({
      source: e.source,
      target: e.target,
    }));
    return { nodes, links };
    // graph identity changes whenever nodes/edges change in the store.
  }, [graph]);
  /* eslint-enable react-hooks/refs */

  const colorForNode = useCallback(
    (id: number): string => {
      // During a run, the animation override (a ref mutated each frame) wins.
      const animIndex = colorIndexRef?.current?.get(id);
      if (animIndex !== undefined) {
        return COLOR_PALETTE[animIndex % COLOR_PALETTE.length];
      }
      if (coloring && coloring[id] !== undefined) {
        return COLOR_PALETTE[coloring[id] % COLOR_PALETTE.length];
      }
      return UNCOLORED;
    },
    [coloring, colorIndexRef]
  );

  const handleNodeClick = useCallback(
    (node: FGNode) => {
      const id = node.id as number;
      if (mode === "delete") {
        onDeleteNode(id);
        return;
      }
      if (mode === "connect") {
        if (selected === null) {
          setSelected(id);
        } else if (selected !== id) {
          onConnect(selected, id);
          setSelected(null);
        } else {
          setSelected(null);
        }
      }
    },
    [mode, selected, setSelected, onConnect, onDeleteNode]
  );

  const handleLinkClick = useCallback(
    (link: FGLink) => {
      if (mode !== "delete") return;
      onDeleteEdge(endpointId(link.source), endpointId(link.target));
    },
    [mode, onDeleteEdge]
  );

  const handleBackgroundClick = useCallback(
    (event: MouseEvent) => {
      if (mode !== "add") return;
      const coords = fgRef.current?.screen2GraphCoords(
        event.offsetX,
        event.offsetY
      );
      if (!coords) return;
      pendingSpawn.current = { x: coords.x, y: coords.y };
      onAddNodeAt(coords.x, coords.y);
    },
    [mode, onAddNodeAt]
  );

  const handleNodeDrag = useCallback((node: FGNode) => {
    if (!dragStart.current) {
      dragStart.current = {
        id: node.id as number,
        x: node.x ?? 0,
        y: node.y ?? 0,
      };
    }
  }, []);

  const handleNodeDragEnd = useCallback(
    (node: FGNode) => {
      const start = dragStart.current;
      dragStart.current = null;

      if (mode === "connect" && start) {
        // Find the nearest other node to the drop point.
        let nearest: FGNode | null = null;
        let best = CONNECT_RADIUS;
        for (const candidate of nodeMap.current.values()) {
          if ((candidate.id as number) === start.id) continue;
          const dx = (candidate.x ?? 0) - (node.x ?? 0);
          const dy = (candidate.y ?? 0) - (node.y ?? 0);
          const d = Math.hypot(dx, dy);
          if (d < best) {
            best = d;
            nearest = candidate;
          }
        }
        // Revert the dragged node to where it started — in connect mode the drag
        // expresses an edge, not a reposition.
        node.x = start.x;
        node.y = start.y;
        node.fx = undefined;
        node.fy = undefined;
        if (nearest) onConnect(start.id, nearest.id as number);
      } else {
        // Move mode: pin the node where the user dropped it.
        node.fx = node.x;
        node.fy = node.y;
      }
    },
    [mode, onConnect]
  );

  const paintNode = useCallback(
    (node: FGNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const id = node.id as number;
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const r = 6;

      // Selection ring (click-to-connect source).
      if (activeSelected === id) {
        ctx.beginPath();
        ctx.arc(x, y, r + 4, 0, 2 * Math.PI);
        ctx.strokeStyle = "#a5b4fc";
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = colorForNode(id);
      ctx.fill();
      ctx.lineWidth = 1.5 / globalScale;
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.stroke();

      const fontSize = Math.max(11 / globalScale, 3);
      ctx.font = `600 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(String(id), x, y);
    },
    [colorForNode, activeSelected]
  );

  return (
    <div ref={containerRef} className="h-full w-full">
      <ForceGraph2D<NodeExtra>
        ref={fgRef}
        width={dims.width}
        height={dims.height}
        graphData={graphData}
        backgroundColor="rgba(0,0,0,0)"
        nodeRelSize={6}
        autoPauseRedraw={!continuousRedraw}
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={(node, color, ctx) => {
          ctx.beginPath();
          ctx.arc(node.x ?? 0, node.y ?? 0, 9, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        linkColor={(link) =>
          conflicts.has(
            edgeKey(endpointId(link.source), endpointId(link.target))
          )
            ? "#ef4444"
            : "#52525b"
        }
        linkWidth={(link) =>
          conflicts.has(
            edgeKey(endpointId(link.source), endpointId(link.target))
          )
            ? 2.5
            : 1.5
        }
        onNodeClick={handleNodeClick}
        onLinkClick={handleLinkClick}
        onBackgroundClick={handleBackgroundClick}
        onNodeDrag={handleNodeDrag}
        onNodeDragEnd={handleNodeDragEnd}
        cooldownTicks={120}
        d3VelocityDecay={0.3}
      />
    </div>
  );
}
