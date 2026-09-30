"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, CartesianGrid } from "recharts";
import { theme, CATEGORICAL } from "./theme";

const MAX_LABEL = 10;

function truncate(name) {
  return name.length > MAX_LABEL ? `${name.slice(0, MAX_LABEL)}...` : name;
}

// Custom tick: shows the truncated name, but carries the full name in a
// native SVG <title> so hovering the axis label itself reveals it too
// (the chart's own Tooltip already covers hovering the bar).
function Tick({ x, y, payload }) {
  const full = payload.value;
  return (
    <g transform={`translate(${x},${y})`}>
      <title>{full}</title>
      <text dy={12} textAnchor="middle" fill={theme.textMuted} fontSize={11}>
        {truncate(full)}
      </text>
    </g>
  );
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { name, units90d } = payload[0].payload;
  return (
    <div
      style={{
        background: theme.cardBg,
        border: `1px solid ${theme.border}`,
        borderRadius: 6,
        fontSize: 12,
        color: theme.textPrimary,
        padding: "6px 10px",
        maxWidth: 220,
      }}
    >
      <div style={{ fontWeight: 600 }}>{name}</div>
      <div style={{ color: theme.textSecondary }}>{units90d} units (90d)</div>
    </div>
  );
}

// Single series (units sold) -> one consistent hue for every bar, not one
// color per bar - color would otherwise imply an identity dimension that
// isn't there (dataviz skill: color follows the entity, not rank).
export default function BestSellingChart({ data }) {
  if (data.length === 0) {
    return (
      <p className="text-sm" style={{ color: theme.textMuted }}>
        No sales yet.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 32, right: 8, left: 0, bottom: 8 }}>
        <CartesianGrid vertical={false} stroke={theme.border} />
        <XAxis
          dataKey="name"
          tick={<Tick />}
          tickLine={false}
          axisLine={{ stroke: theme.border }}
          interval={0}
          height={30}
        />
        <YAxis
          tick={{ fill: theme.textMuted, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={30}
          domain={[0, (max) => Math.ceil((max * 1.25) / 10) * 10]}
        />
        <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<CustomTooltip />} />
        <Bar dataKey="units90d" fill={CATEGORICAL[0]} radius={[4, 4, 0, 0]} maxBarSize={40}>
          <LabelList dataKey="units90d" position="top" fill={theme.textSecondary} fontSize={11} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
