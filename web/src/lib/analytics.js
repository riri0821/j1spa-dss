/**
 * Owner analytics dashboard - server-side data + calculations, adapted from
 * app/analytics.py. No more warehouse/ETL: everything reads straight off
 * the operational tables/views (real-time, no "last sync" concept), and
 * the original's two velocity endpoints (api_velocity, api_velocity_table)
 * are merged into one combined product-performance table here.
 */
function round(n, d) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

export async function getKpis(supabase) {
  // sales_kpi_summary() aggregates both 90-day buckets in SQL and always
  // returns exactly one row - summing every confirmed sale from the last
  // 180 days client-side instead would hit PostgREST's default 1000-row
  // page at real sales volume, with no order-by to make that slice
  // meaningful.
  const { data } = await supabase.rpc("sales_kpi_summary").single();
  const curRev = Number(data?.current_revenue ?? 0);
  const curCost = Number(data?.current_cost ?? 0);
  const prevRev = Number(data?.previous_revenue ?? 0);
  const prevCost = Number(data?.previous_cost ?? 0);

  const gpm = curRev ? round(((curRev - curCost) / curRev) * 100, 2) : 0;
  const prevGpm = prevRev ? ((prevRev - prevCost) / prevRev) * 100 : 0;

  return {
    grossProfitMarginPct: gpm,
    grossProfitMarginDeltaPct: round(gpm - prevGpm, 1),
  };
}

export async function getProductPerformance(supabase) {
  const [{ data: velocity }, { data: products }] = await Promise.all([
    supabase.from("vw_product_velocity").select("sku, revenue_90d, units_90d, gross_profit_90d"),
    supabase
      .from("products")
      .select("sku, name, category, stock_on_hand, reorder_point")
      .eq("is_active", true),
  ]);

  const velBySku = new Map((velocity ?? []).map((v) => [v.sku, v]));

  // top 40% by trailing-90d units are "Fast-moving"
  const unitsDesc = (products ?? [])
    .map((p) => Number(velBySku.get(p.sku)?.units_90d ?? 0))
    .sort((a, b) => b - a);
  const cutoff = unitsDesc.length ? unitsDesc[Math.floor(unitsDesc.length * 0.4)] : 0;

  const rows = (products ?? []).map((p) => {
    const v = velBySku.get(p.sku);
    const units = Number(v?.units_90d ?? 0);
    const movement = units === 0 ? "No recent sales" : units >= Math.max(cutoff, 1) ? "Fast-moving" : "Slow-moving";

    let status, severity;
    if (p.stock_on_hand <= p.reorder_point) {
      status = "Low stock";
      severity = 0;
    } else if (p.reorder_point > 0 && p.stock_on_hand > 3 * p.reorder_point) {
      status = "Overstocked";
      severity = 1;
    } else {
      status = "Stable";
      severity = 2;
    }

    return {
      sku: p.sku,
      name: p.name,
      category: p.category,
      stockOnHand: p.stock_on_hand,
      reorderPoint: p.reorder_point,
      units90d: Math.round(units),
      revenue90d: round(Number(v?.revenue_90d ?? 0), 2),
      grossProfit90d: round(Number(v?.gross_profit_90d ?? 0), 2),
      movement,
      status,
      severity,
    };
  });

  rows.sort((a, b) => a.severity - b.severity || b.units90d - a.units90d);
  return rows;
}

// Everything here is derived from getProductPerformance()'s rows - no extra
// Supabase round trip needed, just different views of the same data.
export function summarizeDashboard(performanceRows) {
  const totalUnitsInStock = performanceRows.reduce((s, r) => s + r.stockOnHand, 0);
  const restockingCritical = performanceRows.filter((r) => r.status === "Low stock").length;

  const topSelling = [...performanceRows]
    .sort((a, b) => b.units90d - a.units90d)
    .slice(0, 5)
    .map((r) => ({ sku: r.sku, name: r.name, units90d: r.units90d }));

  const stockByCategory = new Map();
  for (const r of performanceRows) {
    stockByCategory.set(r.category, (stockByCategory.get(r.category) ?? 0) + r.stockOnHand);
  }
  const categoryTotals = [...stockByCategory.entries()]
    .map(([category, units]) => ({ category, units }))
    .sort((a, b) => b.units - a.units);

  return { totalUnitsInStock, restockingCritical, topSelling, categoryTotals };
}

export async function getSalesHeatmap(supabase) {
  // monthly_sales_totals() aggregates in SQL (one row per calendar month) -
  // selecting straight from vw_monthly_sales instead would return one row
  // per sku per month (40,000+ for the real catalog), which PostgREST
  // silently truncates to its default 1000-row page, understating every
  // month's real unit volume.
  const { data } = await supabase.rpc("monthly_sales_totals");
  const totals = new Map();
  for (const r of data ?? []) {
    const key = `${r.year}-${r.month}`;
    totals.set(key, (totals.get(key) ?? 0) + Number(r.units));
  }
  if (totals.size === 0) return { years: [], cells: [] };

  // Gap-fill: a month with zero sales inside the historical span is a real
  // "0", not a missing cell - only months before the first sale or after
  // the last are left out entirely.
  const keys = [...totals.keys()].map((k) => k.split("-").map(Number));
  const first = keys.reduce((a, b) => (a[0] * 12 + a[1] <= b[0] * 12 + b[1] ? a : b));
  const last = keys.reduce((a, b) => (a[0] * 12 + a[1] >= b[0] * 12 + b[1] ? a : b));

  const cells = [];
  let [y, m] = first;
  while (y * 12 + m <= last[0] * 12 + last[1]) {
    cells.push({ year: y, month: m, units: Math.round(totals.get(`${y}-${m}`) ?? 0) });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  const years = [...new Set(cells.map((c) => c.year))].sort((a, b) => a - b);
  return { years, cells };
}
