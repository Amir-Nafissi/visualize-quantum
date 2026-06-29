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

interface BitstringProb {
  bits: string;
  prob: number;
}

interface ProbabilityBarsProps {
  /** Top measured bitstrings with their probabilities (already sorted). */
  data: BitstringProb[];
}

/** Bar chart of the most probable measured bitstrings. */
export function ProbabilityBars({ data }: ProbabilityBarsProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
        No measurements yet.
      </div>
    );
  }

  const top = data.slice(0, 5);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={top}
        margin={{ top: 16, right: 12, bottom: 4, left: -8 }}
      >
        <XAxis
          dataKey="bits"
          stroke="#71717a"
          fontSize={10}
          tickLine={false}
          axisLine={{ stroke: "#27272a" }}
          interval={0}
          angle={top.length > 3 ? -20 : 0}
          textAnchor={top.length > 3 ? "end" : "middle"}
          height={top.length > 3 ? 44 : 24}
        />
        <YAxis
          stroke="#71717a"
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: "#27272a" }}
          width={48}
          tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          contentStyle={{
            background: "#18181b",
            border: "1px solid #27272a",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value: unknown) => [
            `${(Number(value) * 100).toFixed(1)}%`,
            "Probability",
          ]}
        />
        <Bar dataKey="prob" radius={[4, 4, 0, 0]} isAnimationActive>
          {top.map((entry, i) => (
            <Cell key={entry.bits} fill={i === 0 ? "#6366f1" : "#4f46e5"} />
          ))}
          <LabelList
            dataKey="prob"
            position="top"
            formatter={(v: unknown) => `${Math.round(Number(v) * 100)}%`}
            fontSize={10}
            fill="#a1a1aa"
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
