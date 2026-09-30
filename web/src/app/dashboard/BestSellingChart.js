"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, CartesianGrid } from "recharts";
import { theme, CATEGORICAL } from "./theme";

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
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 20, right: 8, left: 0, bottom: 8 }}>
        <CartesianGrid vertical={false} stroke={theme.border} />
        <XAxis
          dataKey="name"
          tick={{ fill: theme.textMuted, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: theme.border }}
          interval={0}
          angle={-20}
          textAnchor="end"
          height={50}
        />
        <YAxis tick={{ fill: theme.textMuted, fontSize: 11 }} tickLine={false} axisLine={false} width={30} />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          contentStyle={{
            background: theme.cardBg,
            border: `1px solid ${theme.border}`,
            borderRadius: 6,
            fontSize: 12,
            color: theme.textPrimary,
          }}
        />
        <Bar dataKey="units90d" fill={CATEGORICAL[0]} radius={[4, 4, 0, 0]} maxBarSize={40}>
          <LabelList dataKey="units90d" position="top" fill={theme.textSecondary} fontSize={11} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
