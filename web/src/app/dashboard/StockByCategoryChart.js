"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { theme, CATEGORICAL, CATEGORY_OTHER } from "./theme";

// Categorical identity -> fixed hue order, capped at 5 slices + "Other"
// (dataviz skill: past a handful of series, fold the tail rather than
// keep generating new hues).
export default function StockByCategoryChart({ data }) {
  if (data.length === 0) {
    return (
      <p className="text-sm" style={{ color: theme.textMuted }}>
        No stock yet.
      </p>
    );
  }

  const top = data.slice(0, 5);
  const restUnits = data.slice(5).reduce((s, d) => s + d.units, 0);
  const slices = restUnits > 0 ? [...top, { category: "Other", units: restUnits }] : top;
  const total = slices.reduce((s, d) => s + d.units, 0) || 1;

  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width={140} height={140}>
        <PieChart>
          <Pie
            data={slices}
            dataKey="units"
            nameKey="category"
            innerRadius={40}
            outerRadius={65}
            paddingAngle={2}
            stroke={theme.cardBg}
            strokeWidth={2}
          >
            {slices.map((s, i) => (
              <Cell key={s.category} fill={s.category === "Other" ? CATEGORY_OTHER : CATEGORICAL[i % CATEGORICAL.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: theme.cardBg,
              border: `1px solid ${theme.border}`,
              borderRadius: 6,
              fontSize: 12,
              color: theme.textPrimary,
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <ul className="flex flex-col gap-1.5 text-xs">
        {slices.map((s, i) => (
          <li key={s.category} className="flex items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: s.category === "Other" ? CATEGORY_OTHER : CATEGORICAL[i % CATEGORICAL.length] }}
            />
            <span style={{ color: theme.textSecondary }}>{s.category}</span>
            <span className="ml-auto tabular-nums" style={{ color: theme.textPrimary }}>
              {Math.round((s.units / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
