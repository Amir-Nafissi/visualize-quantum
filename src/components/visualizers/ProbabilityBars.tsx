"use client";

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatPercent } from "@/lib/utils";

interface ConflictTier {
  conflicts: number;
  prob: number;
}

interface ProbabilityBarsProps {
  /** Probability mass grouped by conflict count (any order — sorted here). */
  data: ConflictTier[];
}

interface Row extends ConflictTier {
  label: string;
}

/** "0 Conflicts", "1 Conflict", "2 Conflicts", … */
function conflictLabel(k: number): string {
  return `${k} Conflict${k === 1 ? "" : "s"}`;
}

// Green = proper coloring (success); amber/red = increasing numbers of errors.
const SUCCESS_FILL = "#10b981";
const ERROR_FILL = "#f43f5e";

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: Row }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium text-foreground">{row.label}</div>
      <div className="text-muted-foreground">
        Probability{" "}
        <span className="font-medium text-foreground">
          {formatPercent(row.prob)}
        </span>
      </div>
    </div>
  );
}

/** Distribution of measurement outcomes by solution quality (conflict count). */
export function ProbabilityBars({ data }: ProbabilityBarsProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
        No measurements yet.
      </div>
    );
  }

  // Order tiers by conflict count ascending so "0 Conflicts" sits leftmost.
  const rows: Row[] = [...data]
    .sort((a, b) => a.conflicts - b.conflicts)
    .map((d) => ({ ...d, label: conflictLabel(d.conflicts) }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={rows} margin={{ top: 18, right: 12, bottom: 6, left: -4 }}>
        <XAxis
          dataKey="conflicts"
          stroke="#71717a"
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: "#27272a" }}
          interval={0}
          height={40}
          tickFormatter={(v: unknown) => String(v)}
          label={{
            value: "Number of conflicts",
            position: "insideBottom",
            offset: 0,
            fontSize: 11,
            fill: "#71717a",
          }}
        />
        <YAxis
          stroke="#71717a"
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: "#27272a" }}
          width={52}
          domain={[0, "auto"]}
          tickFormatter={(v: unknown) => formatPercent(Number(v))}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          content={<ChartTooltip />}
        />
        <Bar dataKey="prob" radius={[4, 4, 0, 0]} isAnimationActive>
          {rows.map((entry) => (
            <Cell
              key={entry.conflicts}
              fill={entry.conflicts === 0 ? SUCCESS_FILL : ERROR_FILL}
            />
          ))}
          <LabelList
            dataKey="prob"
            position="top"
            formatter={(v: unknown) => formatPercent(Number(v))}
            fontSize={10}
            fill="#a1a1aa"
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
