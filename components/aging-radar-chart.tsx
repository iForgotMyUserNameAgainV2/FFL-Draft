"use client";

import {
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Position, TeamProfile } from "@/lib/types/dynasty";
import { POSITIONS } from "@/lib/types/dynasty";
import { remainingEliteYears, survivalCurveSeries } from "@/lib/math/weibull";

/** Validated categorical series colors (dark-surface steps): QB, RB, WR, TE. */
export const POSITION_COLORS: Record<Position, string> = {
  QB: "var(--color-series-qb)",
  RB: "var(--color-series-rb)",
  WR: "var(--color-series-wr)",
  TE: "var(--color-series-te)",
};

const CHART_INK = "var(--color-ink-muted)";
const CHART_GRID = "var(--color-grid)";

const tooltipStyle = {
  backgroundColor: "var(--color-surface-2)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--color-ink-primary)",
} as const;

/**
 * Positional longevity radar: mean remaining elite years (Weibull mean
 * residual life) per position for a team, overlaid on the league mean.
 */
export function AgingRadarChart({
  team,
  league,
}: {
  team: TeamProfile;
  league: TeamProfile[];
}) {
  const data = POSITIONS.map((pos) => ({
    position: pos,
    team: meanRemainingYears(team, pos),
    league:
      league.reduce((s, t) => s + meanRemainingYears(t, pos), 0) /
      Math.max(1, league.length),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke={CHART_GRID} />
        <PolarAngleAxis
          dataKey="position"
          tick={{ fill: CHART_INK, fontSize: 12 }}
        />
        <PolarRadiusAxis
          angle={90}
          tick={{ fill: CHART_INK, fontSize: 10 }}
          stroke={CHART_GRID}
        />
        <Radar
          name={team.roster.ownerName}
          dataKey="team"
          stroke="var(--color-series-qb)"
          fill="var(--color-series-qb)"
          fillOpacity={0.18}
          strokeWidth={2}
        />
        <Radar
          name="League mean"
          dataKey="league"
          stroke="var(--color-ink-muted)"
          fill="var(--color-ink-muted)"
          fillOpacity={0.08}
          strokeWidth={2}
          strokeDasharray="4 3"
        />
        <Legend wrapperStyle={{ fontSize: 12, color: CHART_INK }} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value) => [`${Number(value).toFixed(1)} yrs`, undefined]}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

function meanRemainingYears(team: TeamProfile, pos: Position): number {
  const players = team.roster.players.filter((p) => p.position === pos);
  if (players.length === 0) return 0;
  return (
    players.reduce((s, p) => s + remainingEliteYears(p.age, p.position), 0) /
    players.length
  );
}

/**
 * Weibull elite-survival curves S(t) by position, ages 21–40.
 * One line per position, validated 4-slot categorical palette, legend +
 * hover crosshair per the viz spec.
 */
export function SurvivalCurvesChart() {
  const data = survivalCurveSeries(21, 40);
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -16 }}>
        <XAxis
          dataKey="age"
          tick={{ fill: CHART_INK, fontSize: 11 }}
          stroke={CHART_GRID}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
          tick={{ fill: CHART_INK, fontSize: 11 }}
          stroke={CHART_GRID}
          tickLine={false}
          domain={[0, 1]}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value, name) => [
            `${(Number(value) * 100).toFixed(1)}%`,
            String(name),
          ]}
          labelFormatter={(age) => `Age ${age}`}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: CHART_INK }} />
        {POSITIONS.map((pos) => (
          <Line
            key={pos}
            type="monotone"
            dataKey={pos}
            stroke={POSITION_COLORS[pos]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
