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

interface BitstringProb {
  bits: string;
  prob: number;
}

interface ProbabilityBarsProps {
  /** Top measured bitstrings with their probabilities (already sorted desc). */
  data: BitstringProb[];
  /** Colors per node — used to group the bitstring into one-hot blocks. */
  numColors?: number;
}

interface Row extends BitstringProb {
  rank: string;
  grouped: string;
}

/** Insert a space every `size` chars so the one-hot structure is readable. */
function groupBits(bits: string, size: number): string {
  if (!size || size < 1) return bits;
  const parts: string[] = [];
  for (let i = 0; i < bits.length; i += size) {
    parts.push(bits.slice(i, i + size));
  }
  return parts.join(" ");
}

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
      <div className="mb-1 font-mono text-[11px] tracking-wider text-foreground">
        {row.grouped}
      </div>
      <div className="text-muted-foreground">
        Probability{" "}
        <span className="font-medium text-foreground">
          {formatPercent(row.prob)}
        </span>
      </div>
    </div>
  );
}

/** Bar chart of the most probable measured bitstrings. */
export function ProbabilityBars({ data, numColors = 0 }: ProbabilityBarsProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
        No measurements yet.
      </div>
    );
  }

  const rows: Row[] = data.slice(0, 5).map((d, i) => ({
    ...d,
    rank: `#${i + 1}`,
    grouped: groupBits(d.bits, numColors),
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={rows} margin={{ top: 18, right: 12, bottom: 4, left: -4 }}>
        <XAxis
          dataKey="rank"
          stroke="#71717a"
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: "#27272a" }}
          interval={0}
          height={24}
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
          {rows.map((entry, i) => (
            <Cell key={entry.bits} fill={i === 0 ? "#6366f1" : "#4f46e5"} />
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
