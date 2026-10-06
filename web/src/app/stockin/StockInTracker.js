"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { theme } from "../dashboard/theme";
import RecordsTable from "../sales/RecordsTable";

const MAX_LOOKBACK_MONTHS = 18;

const RANGES = [
  { value: "day", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
];

// Same windowing as Sales Tracker (sales/SalesTracker.js) - kept as a local
// copy rather than a shared import so this route stays self-contained.
function rangeStart(range) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (range === "day") {
    // already at today's midnight
  } else if (range === "week") {
    const dow = (start.getDay() + 6) % 7; // 0 = Monday
    start.setDate(start.getDate() - dow);
  } else if (range === "month") {
    start.setDate(1);
  } else if (range === "year") {
    start.setMonth(0, 1);
  }

  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - MAX_LOOKBACK_MONTHS);

  return start < cutoff ? cutoff : start;
}

function money(n) {
  return `₱${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function StockInTracker() {
  const supabase = createClient();
  const [range, setRange] = useState("month");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (r) => {
      setLoading(true);
      setError("");
      const since = rangeStart(r).toISOString();

      const { data, error: queryError } = await supabase
        .from("stock_movements")
        .select(
          "movement_id, movement_ts, sku, quantity, balance_after, supplier, unit_cost, reference, profiles(full_name), products(name)"
        )
        .eq("movement_type", "stock_in")
        .gte("movement_ts", since)
        .order("movement_id", { ascending: false })
        .limit(1000);

      setLoading(false);
      if (queryError) {
        setError(queryError.message);
        return;
      }

      setRecords(
        (data ?? []).map((r) => ({
          ...r,
          key: `movement-${r.movement_id}`,
          name: r.products?.name ?? r.sku,
          spent: r.unit_cost != null ? Number(r.unit_cost) * r.quantity : null,
        }))
      );
    },
    [supabase]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(range);
  }, [range, load]);

  // "From what supplier is that item" - every supplier this SKU has ever
  // been received from (not limited to the date range above), with totals,
  // so a single batch's detail view doubles as that SKU's supplier history.
  async function fetchDetail(row) {
    const { data } = await supabase
      .from("stock_movements")
      .select("supplier, quantity, unit_cost")
      .eq("sku", row.sku)
      .eq("movement_type", "stock_in");

    const bySupplier = new Map();
    for (const m of data ?? []) {
      const key = m.supplier || "Unknown";
      const entry = bySupplier.get(key) ?? { supplier: key, units: 0, spent: 0, batches: 0 };
      entry.units += m.quantity;
      entry.spent += m.unit_cost != null ? Number(m.unit_cost) * m.quantity : 0;
      entry.batches += 1;
      bySupplier.set(key, entry);
    }
    const breakdown = [...bySupplier.values()].sort((a, b) => b.units - a.units);

    return (
      <>
        <p className="mb-2 text-xs" style={{ color: theme.textMuted }}>
          Supplier breakdown for {row.sku} - {row.name}
        </p>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: theme.textMuted }}>
              <th className="px-2 py-1 text-left font-normal">Supplier</th>
              <th className="px-2 py-1 text-right font-normal">Batches</th>
              <th className="px-2 py-1 text-right font-normal">Units received</th>
              <th className="px-2 py-1 text-right font-normal">Total spent</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.map((b) => (
              <tr key={b.supplier} className="border-t" style={{ borderColor: theme.border }}>
                <td className="px-2 py-1">{b.supplier}</td>
                <td className="px-2 py-1 text-right">{b.batches}</td>
                <td className="px-2 py-1 text-right">{b.units}</td>
                <td className="px-2 py-1 text-right">{money(b.spent)}</td>
              </tr>
            ))}
            {breakdown.length === 0 && (
              <tr>
                <td colSpan={4} className="px-2 py-2 text-center" style={{ color: theme.textMuted }}>
                  No stock-in history for this SKU.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </>
    );
  }

  const totalUnits = records.reduce((s, r) => s + r.quantity, 0);
  const totalSpent = records.reduce((s, r) => s + (r.spent ?? 0), 0);

  return (
    <div className="flex flex-col gap-4" style={{ color: theme.textSecondary }}>
      <div>
        <p className="text-xs" style={{ color: theme.textMuted }}>
          Total spent in this window
        </p>
        <p className="text-2xl font-semibold" style={{ color: theme.textPrimary }}>
          {money(totalSpent)}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: theme.textMuted }}>
          View-only record of stock received, capped to the trailing {MAX_LOOKBACK_MONTHS} months. {totalUnits} units.
        </p>
        <div className="flex gap-1 rounded border p-1" style={{ borderColor: theme.border }}>
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className="rounded px-3 py-1 text-xs font-medium"
              style={
                range === r.value
                  ? { backgroundColor: theme.accent, color: "#05230f" }
                  : { color: theme.textSecondary }
              }
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading ? (
        <p className="text-sm" style={{ color: theme.textMuted }}>
          Loading...
        </p>
      ) : (
        <RecordsTable
          rows={records}
          renderId={(r) => `#${r.movement_id}`}
          searchFields={["sku", "name", "supplier"]}
          searchPlaceholder="Search by SKU, item, or supplier..."
          columns={[
            { label: "Time", render: (r) => new Date(r.movement_ts).toLocaleString() },
            { label: "SKU", render: (r) => r.sku },
            { label: "Item", render: (r) => r.name },
            { label: "Supplier", render: (r) => r.supplier ?? "-" },
            { label: "Qty added", align: "right", render: (r) => `+${r.quantity}` },
            { label: "Spent", align: "right", render: (r) => (r.spent != null ? money(r.spent) : "-") },
            { label: "Recorded by", render: (r) => r.profiles?.full_name ?? "Former staff" },
          ]}
          fetchDetail={fetchDetail}
          emptyMessage="No stock received in this window."
        />
      )}
    </div>
  );
}
