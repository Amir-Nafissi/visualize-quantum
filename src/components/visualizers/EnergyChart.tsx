"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface EnergyChartProps {
  /** Expected-energy value at each optimizer evaluation. */
  history: number[];
}

/** Line chart of QAOA expected energy over optimization steps. */
export function EnergyChart({ history }: EnergyChartProps) {
  const data = history.map((energy, step) => ({ step: step + 1, energy }));

  if (data.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
        No energy history yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
        <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="step"
          stroke="#71717a"
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: "#27272a" }}
          label={{
            value: "Optimization step",
            position: "insideBottom",
            offset: -2,
            fill: "#71717a",
            fontSize: 11,
          }}
        />
        <YAxis
          stroke="#71717a"
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: "#27272a" }}
          width={48}
        />
        <Tooltip
          contentStyle={{
            background: "#18181b",
            border: "1px solid #27272a",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: "#a1a1aa" }}
          formatter={(value: unknown) => [Number(value).toFixed(4), "Energy"]}
        />
        <Line
          type="monotone"
          dataKey="energy"
          stroke="#6366f1"
          strokeWidth={2}
          dot={{ r: 2, fill: "#6366f1" }}
          activeDot={{ r: 4 }}
          isAnimationActive
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
