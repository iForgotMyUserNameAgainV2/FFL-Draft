"use client";

import {
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WeeklyPerformance } from "@/lib/league-service";

const CHART_INK = "var(--color-ink-muted)";
const CHART_GRID = "var(--color-grid)";

/**
 * Weekly Actual PF vs optimal Max-PF for one roster. The gap between the
 * two lines is the start/sit leak the optimizer wants closed.
 */
export function MaxPfChart({
  weekly,
  rosterId,
}: {
  weekly: WeeklyPerformance[];
  rosterId: number;
}) {
  const data = weekly
    .filter((w) => w.rosterId === rosterId)
    .sort((a, b) => a.week - b.week)
    .map((w) => ({
      week: w.week,
      Actual: Number(w.actual.toFixed(1)),
      "Max-PF": Number(w.optimal.toFixed(1)),
    }));

  if (data.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        No weekly scoring data available yet for this roster.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
        <XAxis
          dataKey="week"
          tickFormatter={(w: number) => `W${w}`}
          tick={{ fill: CHART_INK, fontSize: 11 }}
          stroke={CHART_GRID}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: CHART_INK, fontSize: 11 }}
          stroke={CHART_GRID}
          tickLine={false}
          domain={["auto", "auto"]}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "var(--color-surface-2)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--color-ink-primary)",
          }}
          labelFormatter={(week) => `Week ${week}`}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: CHART_INK }} />
        <Line
          type="monotone"
          dataKey="Max-PF"
          stroke="var(--color-series-rb)"
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="Actual"
          stroke="var(--color-series-qb)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
