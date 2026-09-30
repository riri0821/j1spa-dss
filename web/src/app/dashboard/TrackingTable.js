"use client";

import { useMemo, useState } from "react";
import { theme, STATUS, CATEGORICAL } from "./theme";

const ABC_COLOR = { A: CATEGORICAL[0], B: "#5598e7", C: "#9ec5f4" };

export default function TrackingTable({ rows }) {
  const [category, setCategory] = useState("all");
  const [movement, setMovement] = useState("all");
  const [status, setStatus] = useState("all");

  const categories = useMemo(() => [...new Set(rows.map((r) => r.category))].sort(), [rows]);

  const filtered = rows.filter(
    (r) =>
      (category === "all" || r.category === category) &&
      (movement === "all" || r.movement === movement) &&
      (status === "all" || r.status === status)
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Select value={category} onChange={setCategory} options={["all", ...categories]} labelAll="All Categories" />
        <Select
          value={movement}
          onChange={setMovement}
          options={["all", "Fast-moving", "Slow-moving", "No recent sales"]}
          labelAll="All Movement"
        />
        <Select
          value={status}
          onChange={setStatus}
          options={["all", "Low stock", "Overstocked", "Stable"]}
          labelAll="All Statuses"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: theme.border }}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr style={{ color: theme.textMuted }}>
              <th className="px-3 py-2 font-normal">SKU</th>
              <th className="px-3 py-2 font-normal">Item name</th>
              <th className="px-3 py-2 font-normal">Category</th>
              <th className="px-3 py-2 font-normal">Class</th>
              <th className="px-3 py-2 font-normal">Movement</th>
              <th className="px-3 py-2 font-normal">Stock level</th>
              <th className="px-3 py-2 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const gaugeMax = Math.max(r.reorderPoint * 3, r.stockOnHand, 1);
              const pct = Math.min(100, Math.round((r.stockOnHand / gaugeMax) * 100));
              return (
                <tr key={r.sku} className="border-t" style={{ borderColor: theme.border }}>
                  <td className="px-3 py-2 font-mono">
                    <a href={`/forecasting?sku=${encodeURIComponent(r.sku)}`} style={{ color: CATEGORICAL[0] }}>
                      {r.sku}
                    </a>
                  </td>
                  <td className="px-3 py-2" style={{ color: theme.textPrimary }}>
                    {r.name}
                  </td>
                  <td className="px-3 py-2" style={{ color: theme.textSecondary }}>
                    {r.category}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                      style={{ backgroundColor: ABC_COLOR[r.abcClass] }}
                    />
                    <span style={{ color: theme.textSecondary }}>{r.abcClass}</span>
                  </td>
                  <td className="px-3 py-2" style={{ color: theme.textSecondary }}>
                    {r.movement}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 rounded-full" style={{ backgroundColor: theme.cardBgAlt }}>
                        <div
                          className="h-1.5 rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: STATUS[r.status] }}
                        />
                      </div>
                      <span className="tabular-nums" style={{ color: theme.textSecondary }}>
                        {r.stockOnHand}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className="rounded px-2 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: `${STATUS[r.status]}22`, color: STATUS[r.status] }}
                    >
                      {r.status}
                    </span>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center" style={{ color: theme.textMuted }}>
                  No products match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Select({ value, onChange, options, labelAll }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded border px-2 py-1.5 text-xs"
      style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.textSecondary }}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o === "all" ? labelAll : o}
        </option>
      ))}
    </select>
  );
}
