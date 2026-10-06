"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { createClient } from "@/lib/supabase/client";
import { theme, CATEGORICAL } from "./theme";

// periods is only meaningful for "year" now - day/week/month windows are
// fixed by the calendar server-side (dashboard_gross_net_summary), not a
// trailing row count. See sql/supabase_fix_gross_net_windows.sql.
const RANGES = [
  { value: "day", label: "Day", periods: 30 },
  { value: "week", label: "Week", periods: 12 },
  { value: "month", label: "Month", periods: 12 },
  { value: "year", label: "Year", periods: 20 },
];

function formatPeriod(dateStr, granularity) {
  const d = new Date(dateStr);
  if (granularity === "year") return d.getFullYear().toString();
  if (granularity === "month") return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  if (granularity === "week") return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmt(n) {
  return `₱${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const gross = payload.find((p) => p.dataKey === "gross")?.value ?? 0;
  const net = payload.find((p) => p.dataKey === "net")?.value ?? 0;
  return (
    <div
      style={{
        background: theme.cardBg,
        border: `1px solid ${theme.border}`,
        borderRadius: 6,
        fontSize: 12,
        color: theme.textPrimary,
        padding: "6px 10px",
      }}
    >
      <div style={{ fontWeight: 600 }}>{label}</div>
      <div style={{ color: CATEGORICAL[0] }}>Gross: {fmt(gross)}</div>
      <div style={{ color: CATEGORICAL[1] }}>Net: {fmt(net)}</div>
    </div>
  );
}

// Combined sales + services, per period. Gross/Net replace the old
// heatmap's Min/Avg/Max units-sold stats; the bar chart replaces the
// heatmap grid itself - two related magnitudes read better as grouped
// bars than as color intensity (dataviz skill: pick the form before color).
export default function GrossNetChart() {
  const supabase = createClient();
  const [range, setRange] = useState("month");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (r) => {
      setLoading(true);
      setError("");
      const periods = RANGES.find((x) => x.value === r).periods;
      const { data, error: rpcError } = await supabase.rpc("dashboard_gross_net_summary", {
        p_granularity: r,
        p_periods: periods,
      });
      setLoading(false);
      if (rpcError) {
        setError(rpcError.message);
        return;
      }
      setRows(data ?? []);
    },
    [supabase]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(range);
  }, [range, load]);

  const totalGross = rows.reduce((s, r) => s + Number(r.gross), 0);
  const totalNet = rows.reduce((s, r) => s + Number(r.net), 0);
  const chartData = rows.map((r) => ({
    period: formatPeriod(r.period_start, range),
    gross: Number(r.gross),
    net: Number(r.net),
  }));

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-xs leading-tight">
          <p style={{ color: CATEGORICAL[0] }}>
            Gross: <span className="font-semibold tabular-nums">{fmt(totalGross)}</span>
          </p>
          <p style={{ color: CATEGORICAL[1] }}>
            Net: <span className="font-semibold tabular-nums">{fmt(totalNet)}</span>
          </p>
        </div>
        <div className="flex gap-1 rounded border p-1" style={{ borderColor: theme.border }}>
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className="rounded px-2 py-0.5 text-xs font-medium"
              style={
                range === r.value ? { backgroundColor: theme.accent, color: "#05230f" } : { color: theme.textSecondary }
              }
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {!loading && chartData.length === 0 ? (
        <p className="text-sm" style={{ color: theme.textMuted }}>
          No sales or services recorded yet.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height="100%" minHeight={160}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barGap={2}>
            <XAxis
              dataKey="period"
              tick={{ fill: theme.textMuted, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis hide />
            <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<CustomTooltip />} />
            <Bar dataKey="gross" fill={CATEGORICAL[0]} radius={[4, 4, 0, 0]} maxBarSize={18} />
            <Bar dataKey="net" fill={CATEGORICAL[1]} radius={[4, 4, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      )}

      <div className="flex items-center gap-3 text-xs" style={{ color: theme.textSecondary }}>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CATEGORICAL[0] }} />
          Gross
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CATEGORICAL[1] }} />
          Net
        </span>
      </div>
    </div>
  );
}
