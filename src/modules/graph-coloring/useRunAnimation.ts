"use client";

import { useEffect, useRef } from "react";
import type { Coloring } from "./lib";
import type { RunPhase } from "./store";

/** Total duration of the energy-driven "settle" replay. */
const SETTLE_MS = 3500;
/** Per-node color-flip cadence bounds (ms): fast at high energy, slow at low. */
const FAST_INTERVAL = 60;
const SLOW_INTERVAL = 520;

interface RunAnimationArgs {
  nodes: number[];
  numColors: number;
  runPhase: RunPhase;
  finalColoring: Coloring | null;
  energyHistory: number[] | null;
  /** Called once when the settle animation locks onto the final coloring. */
  onSettled: () => void;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const easeInQuad = (t: number) => t * t;
const randIndex = (n: number) => Math.floor(Math.random() * Math.max(1, n));

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/**
 * Drives the cinematic node-color animation for a QAOA run.
 *
 * Returns `colorIndexRef`, a map of node id -> currently displayed color index.
 * The force-graph paint function reads it every frame (the canvas runs with
 * `autoPauseRedraw={false}` while animating), so colors animate with no React
 * re-renders. The ref is cleared when not animating, letting the canvas fall
 * back to the locked `coloring` from the API.
 */
export function useRunAnimation({
  nodes,
  numColors,
  runPhase,
  finalColoring,
  energyHistory,
  onSettled,
}: RunAnimationArgs) {
  const colorIndexRef = useRef<Map<number, number> | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFlipRef = useRef<Map<number, number>>(new Map());

  // Keep the latest inputs in a ref so the rAF loop never goes stale and we
  // don't restart it on every render.
  const argsRef = useRef<RunAnimationArgs>({
    nodes,
    numColors,
    runPhase,
    finalColoring,
    energyHistory,
    onSettled,
  });
  useEffect(() => {
    argsRef.current = {
      nodes,
      numColors,
      runPhase,
      finalColoring,
      energyHistory,
      onSettled,
    };
  });

  useEffect(() => {
    const animating =
      runPhase === "superposition" || runPhase === "settling";

    const stop = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    if (!animating) {
      // Idle/revealed: drop the override so the canvas shows the locked colors.
      colorIndexRef.current = null;
      stop();
      return;
    }

    // Reduced motion: skip the cinematics, lock immediately on settle.
    if (prefersReducedMotion()) {
      if (runPhase === "settling") {
        colorIndexRef.current = null;
        argsRef.current.onSettled();
      }
      return;
    }

    const colors = colorIndexRef.current ?? new Map<number, number>();
    colorIndexRef.current = colors;

    // Seed any nodes that don't yet have a color (e.g. first frame).
    for (const id of argsRef.current.nodes) {
      if (!colors.has(id)) colors.set(id, randIndex(argsRef.current.numColors));
    }

    const settleStart = performance.now();
    let settled = false;

    // Normalize the energy curve once for this settle.
    const hist = argsRef.current.energyHistory ?? [];
    const eMin = hist.length ? Math.min(...hist) : 0;
    const eMax = hist.length ? Math.max(...hist) : 1;
    const eSpan = eMax - eMin || 1;

    const tick = () => {
      const now = performance.now();
      const { nodes: curNodes, numColors: k, finalColoring: final } =
        argsRef.current;
      const phase = argsRef.current.runPhase;

      // "Temperature" 0..1 (1 = hot/fast). Superposition is always hot.
      let temperature = 1;
      let lockProb = 0;

      if (phase === "settling") {
        const f = clamp01((now - settleStart) / SETTLE_MS);
        const step = Math.floor(f * Math.max(0, hist.length - 1));
        const energy = hist.length ? hist[step] : eMin;
        temperature = clamp01((energy - eMin) / eSpan);
        lockProb = easeInQuad(f);

        if (f >= 1 && !settled) {
          settled = true;
          // Lock exactly onto the backend coloring.
          if (final) {
            for (const id of curNodes) colors.set(id, final[id] ?? 0);
          }
          stop();
          argsRef.current.onSettled();
          return;
        }
      }

      const interval = lerp(FAST_INTERVAL, SLOW_INTERVAL, 1 - temperature);

      for (const id of curNodes) {
        if (!colors.has(id)) colors.set(id, randIndex(k));
        const last = lastFlipRef.current.get(id) ?? 0;
        if (now - last < interval) continue;
        lastFlipRef.current.set(id, now);

        // Hesitation: increasingly likely to show the final color as we settle.
        if (final && Math.random() < lockProb) {
          colors.set(id, final[id] ?? 0);
        } else {
          colors.set(id, randIndex(k));
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return stop;
    // Re-run only when the phase changes; the loop reads everything else from
    // refs that a sibling effect keeps in sync.
  }, [runPhase]);

  return { colorIndexRef };
}
