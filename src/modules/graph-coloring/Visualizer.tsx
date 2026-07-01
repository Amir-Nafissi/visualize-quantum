"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Atom,
  BarChart3,
  CheckCircle2,
  Cpu,
  Sparkles,
  Timer,
  TriangleAlert,
} from "lucide-react";
import { EnergyChart } from "@/components/visualizers/EnergyChart";
import { ProbabilityBars } from "@/components/visualizers/ProbabilityBars";
import { formatMs, formatPercent } from "@/lib/utils";
import {
  useGraphColoringStore,
  type ClassicalResult,
  type QaoaResult,
} from "./store";
import { COLOR_PALETTE, conflictingEdges, type Graph } from "./lib";

export function Visualizer() {
  const { graph, result, runPhase } = useGraphColoringStore();

  // While the run animation plays, keep the charts hidden behind a themed
  // placeholder so nothing reveals before the graph locks onto its colors.
  if (runPhase === "superposition" || runPhase === "settling") {
    return <CollapsingState phase={runPhase} />;
  }

  if (!result) {
    return <EmptyState />;
  }

  if (result.kind === "classical") {
    return <ClassicalView graph={graph} result={result} />;
  }
  return <QuantumView graph={graph} result={result} />;
}

/** Header + status banner shared by both result views. */
function StatusBanner({
  isProper,
  conflictCount,
  detail,
}: {
  isProper: boolean;
  conflictCount: number;
  detail: string;
}) {
  return (
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
            : `${conflictCount} conflicting edge(s)`}
        </p>
        <p className="text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

/** Color legend shared by both result views. */
function ColorLegend({
  numColors,
  coloring,
}: {
  numColors: number;
  coloring: Record<number, number>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
      {Array.from({ length: numColors }).map((_, c) => (
        <div key={c} className="flex items-center gap-1.5 text-xs">
          <span
            className="size-3 rounded-full"
            style={{ background: COLOR_PALETTE[c % COLOR_PALETTE.length] }}
          />
          Color {c}
          <span className="text-muted-foreground/60">
            ({Object.values(coloring).filter((v) => v === c).length})
          </span>
        </div>
      ))}
    </div>
  );
}

/** Classical-solver results: no quantum charts, shows algorithm + timing. */
function ClassicalView({
  graph,
  result,
}: {
  graph: Graph;
  result: ClassicalResult;
}) {
  const conflicts = conflictingEdges(graph.edges, result.coloring);
  const isProper = conflicts.length === 0;
  const usedColors = new Set(Object.values(result.coloring));
  const time = formatMs(result.execution_time_ms);
  const algoLabel =
    result.algorithm === "backtracking" ? "Backtracking (exact)" : "Greedy (DSatur)";

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="classical-result"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="space-y-5"
      >
        <StatusBanner
          isProper={isProper}
          conflictCount={conflicts.length}
          detail={`Ran the classical solver. Completed in ${time}.`}
        />

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Colors used" value={`${usedColors.size}/${result.num_colors}`} />
          <Stat label="Conflicts" value={String(conflicts.length)} />
          <Stat label="Execution time" value={time} />
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2">
            <Cpu className="size-4 text-primary" />
            Algorithm used:{" "}
            <span className="font-medium text-foreground">{algoLabel}</span>
          </span>
          <span className="flex items-center gap-2 text-muted-foreground">
            <Timer className="size-4 text-primary" />
            {time}
          </span>
        </div>

        <ColorLegend numColors={result.num_colors} coloring={result.coloring} />
      </motion.div>
    </AnimatePresence>
  );
}

/** QAOA results: full quantum panels (energy chart, quality distribution, …). */
function QuantumView({ graph, result }: { graph: Graph; result: QaoaResult }) {
  const conflicts = conflictingEdges(graph.edges, result.coloring);
  const isProper = conflicts.length === 0;
  const usedColors = new Set(Object.values(result.coloring));
  // The headline probability is the single most-probable measured bitstring —
  // i.e. the tallest bar in the chart, so the two always agree.
  const topProb = result.top_bitstrings[0]?.prob ?? 0;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="result"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="space-y-5"
      >
        <StatusBanner
          isProper={isProper}
          conflictCount={conflicts.length}
          detail={`${
            result.fallback
              ? "Ran on local simulator (IBM fallback). "
              : `Ran on ${result.backend ?? "local simulator"}. `
          }Most-probable measured state: ${formatPercent(topProb)}.`}
        />

        {/* Stat tiles */}
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Colors used" value={`${usedColors.size}/${result.num_colors}`} />
          <Stat label="Conflicts" value={String(conflicts.length)} />
          <Stat label="Top state" value={formatPercent(topProb)} />
        </div>

        {/* Secondary: probability the run lands on *any* proper coloring. */}
        <div className="text-xs text-muted-foreground">
          Probability mass on proper colorings:{" "}
          <span className="font-medium text-foreground">
            {formatPercent(result.success_prob)}
          </span>
          {topProb > result.success_prob && (
            <span className="text-muted-foreground/70">
              {" "}
              — QAOA&apos;s most likely state isn&apos;t always optimal at low p.
            </span>
          )}
        </div>

        <ColorLegend numColors={result.num_colors} coloring={result.coloring} />

        {/* Energy convergence */}
        <ChartCard
          icon={<Activity className="size-4 text-primary" />}
          title="Energy convergence"
          subtitle="Expected energy ⟨H⟩ over optimization steps"
        >
          <EnergyChart history={result.energy_history} />
        </ChartCard>

        {/* Solution quality distribution */}
        <ChartCard
          icon={<BarChart3 className="size-4 text-primary" />}
          title="Solution Quality Distribution"
          subtitle="Probability of measuring a state with N conflicts"
        >
          <ProbabilityBars data={result.conflict_distribution} />
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

function CollapsingState({
  phase,
}: {
  phase: "superposition" | "settling";
}) {
  return (
    <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-4 rounded-xl border border-border bg-card/40 text-center">
      <div className="relative flex size-16 items-center justify-center">
        <motion.span
          className="absolute inset-0 rounded-full border border-primary/40"
          animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        >
          <Atom className="size-7 text-primary" />
        </motion.div>
      </div>
      <div>
        <p className="text-sm font-medium">
          {phase === "superposition"
            ? "Exploring superposition…"
            : "Collapsing the wavefunction…"}
        </p>
        <p className="max-w-xs text-sm text-muted-foreground">
          {phase === "superposition"
            ? "QAOA is optimizing the circuit — watch the nodes flicker through every coloring."
            : "Energy is converging; the nodes are settling onto the final coloring. Results appear once they lock."}
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
