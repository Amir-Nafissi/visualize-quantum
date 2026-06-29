"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Activity, BarChart3, CheckCircle2, Sparkles, TriangleAlert } from "lucide-react";
import { EnergyChart } from "@/components/visualizers/EnergyChart";
import { ProbabilityBars } from "@/components/visualizers/ProbabilityBars";
import { useGraphColoringStore } from "./store";
import { COLOR_PALETTE, conflictingEdges } from "./lib";

export function Visualizer() {
  const { graph, result, status } = useGraphColoringStore();

  if (status === "idle" && !result) {
    return <EmptyState />;
  }

  if (status === "running" && !result) {
    return (
      <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-3 text-muted-foreground">
        <Sparkles className="size-6 animate-pulse text-primary" />
        <p className="text-sm">Optimizing QAOA circuit…</p>
      </div>
    );
  }

  if (!result) {
    return <EmptyState />;
  }

  const conflicts = conflictingEdges(graph.edges, result.coloring);
  const isProper = conflicts.length === 0;
  const usedColors = new Set(Object.values(result.coloring));

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="result"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="space-y-5"
      >
        {/* Status banner */}
        <div
          className={`flex items-center gap-3 rounded-xl border p-4 ${
            isProper
              ? "border-emerald-500/30 bg-emerald-500/10"
              : "border-amber-500/30 bg-amber-500/10"
          }`}
        >
          {isProper ? (
            <CheckCircle2 className="size-5 shrink-0 text-emerald-400" />
          ) : (
            <TriangleAlert className="size-5 shrink-0 text-amber-400" />
          )}
          <div className="text-sm">
            <p className="font-medium">
              {isProper
                ? "Proper coloring found"
                : `${conflicts.length} conflicting edge(s)`}
            </p>
            <p className="text-muted-foreground">
              {result.fallback
                ? "Ran on local simulator (IBM fallback). "
                : `Ran on ${result.backend ?? "local simulator"}. `}
              Best-bitstring success probability{" "}
              {(result.success_prob * 100).toFixed(1)}%.
            </p>
          </div>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Colors used" value={`${usedColors.size}/${result.num_colors}`} />
          <Stat label="Conflicts" value={String(conflicts.length)} />
          <Stat
            label="Success prob"
            value={`${(result.success_prob * 100).toFixed(0)}%`}
          />
        </div>

        {/* Color legend */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
          {Array.from({ length: result.num_colors }).map((_, c) => (
            <div key={c} className="flex items-center gap-1.5 text-xs">
              <span
                className="size-3 rounded-full"
                style={{ background: COLOR_PALETTE[c % COLOR_PALETTE.length] }}
              />
              Color {c}
              <span className="text-muted-foreground/60">
                ({Object.values(result.coloring).filter((v) => v === c).length})
              </span>
            </div>
          ))}
        </div>

        {/* Energy convergence */}
        <ChartCard
          icon={<Activity className="size-4 text-primary" />}
          title="Energy convergence"
          subtitle="Expected energy ⟨H⟩ over optimization steps"
        >
          <EnergyChart history={result.energy_history} />
        </ChartCard>

        {/* Measurement probabilities */}
        <ChartCard
          icon={<BarChart3 className="size-4 text-primary" />}
          title="Measurement probabilities"
          subtitle="Top 5 measured bitstrings"
        >
          <ProbabilityBars data={result.top_bitstrings} />
        </ChartCard>
      </motion.div>
    </AnimatePresence>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
      <div className="rounded-full border border-border bg-secondary/40 p-3">
        <Sparkles className="size-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium">No results yet</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          Build or generate a graph, then run QAOA to see the coloring, energy
          convergence, and measurement probabilities.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold">{value}</p>
    </div>
  );
}

function ChartCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <div>
          <h3 className="text-sm font-semibold leading-tight">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
