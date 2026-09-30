"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from "recharts";
import { theme, CATEGORICAL } from "./theme";

const MAX_LABEL = 14;

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
      <text dx={-8} dy={4} textAnchor="end" fill={theme.textMuted} fontSize={12}>
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
// Horizontal orientation: 5 rows fill the card's height edge-to-edge instead
// of leaving bars narrow and stranded in a wide column, and there's room to
// show most product names in full instead of chopping them to 10 chars.
export default function BestSellingChart({ data }) {
  if (data.length === 0) {
    return (
      <p className="text-sm" style={{ color: theme.textMuted }}>
        No sales yet.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 28, left: 8, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          tick={<Tick />}
          tickLine={false}
          axisLine={false}
          width={120}
        />
        <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<CustomTooltip />} />
        <Bar dataKey="units90d" fill={CATEGORICAL[0]} radius={[0, 4, 4, 0]} maxBarSize={32} barCategoryGap="15%">
          <LabelList dataKey="units90d" position="right" fill={theme.textSecondary} fontSize={12} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
