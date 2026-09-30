/**
 * Owner analytics dashboard - server-side data + calculations, adapted from
 * app/analytics.py. No more warehouse/ETL: everything reads straight off
 * the operational tables/views (real-time, no "last sync" concept), and
 * the original's two velocity endpoints (api_velocity, api_velocity_table)
 * are merged into one combined product-performance table here.
 */
const MANILA_TZ = "Asia/Manila"; // matches the original scheduler's timezone

function round(n, d) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

function dateKeyInManila(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: MANILA_TZ }).format(date);
}

export async function getKpis(supabase) {
  const day = 24 * 60 * 60 * 1000;
  const now = new Date();
  const since180 = new Date(now.getTime() - 180 * day);

  const { data: sales } = await supabase
    .from("sales")
    .select("sale_ts, total_amount, total_cost")
    .eq("status", "confirmed")
    .gte("sale_ts", since180.toISOString());

  const cutoff90 = new Date(now.getTime() - 90 * day);
  const todayKey = dateKeyInManila(now);
  const yesterdayKey = dateKeyInManila(new Date(now.getTime() - day));

  let curRev = 0, curCost = 0, prevRev = 0, prevCost = 0, todayProfit = 0, yesterdayProfit = 0;
  for (const r of sales ?? []) {
    const ts = new Date(r.sale_ts);
    const rev = Number(r.total_amount);
    const cost = Number(r.total_cost);
    if (ts >= cutoff90) {
      curRev += rev;
      curCost += cost;
    } else {
      prevRev += rev;
      prevCost += cost;
    }
    const key = dateKeyInManila(ts);
    if (key === todayKey) todayProfit += rev - cost;
    if (key === yesterdayKey) yesterdayProfit += rev - cost;
  }

  const gpm = curRev ? round(((curRev - curCost) / curRev) * 100, 2) : 0;
  const prevGpm = prevRev ? ((prevRev - prevCost) / prevRev) * 100 : 0;
  // only show a delta once today has *some* recorded profit - a bare 0 most
  // likely means no sales yet today, not an actual crash
  const todayDelta =
    yesterdayProfit && todayProfit
      ? round((Math.abs(yesterdayProfit) ? (todayProfit - yesterdayProfit) / Math.abs(yesterdayProfit) : 0) * 100, 1)
      : null;

  const { count: skuCount } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true);

  return {
    grossProfitMarginPct: gpm,
    grossProfitMarginDeltaPct: round(gpm - prevGpm, 1),
    todayProfit: round(todayProfit, 2),
    todayProfitDeltaPct: todayDelta,
    skuCount: skuCount ?? 0,
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

  // ABC classification by trailing-90d revenue share, computed across every
  // product the view knows about (matches the original's separate ABC
  // endpoint), then only active products are shown below.
  const sortedByRevenue = [...(velocity ?? [])].sort((a, b) => Number(b.revenue_90d) - Number(a.revenue_90d));
  const totalRevenue = sortedByRevenue.reduce((s, v) => s + Number(v.revenue_90d), 0) || 1;
  const classBySku = new Map();
  let cumulative = 0;
  for (const v of sortedByRevenue) {
    cumulative += Number(v.revenue_90d);
    const share = cumulative / totalRevenue;
    classBySku.set(v.sku, share <= 0.8 ? "A" : share <= 0.95 ? "B" : "C");
  }

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
      abcClass: classBySku.get(p.sku) ?? "C",
      movement,
      status,
      severity,
    };
  });

  rows.sort((a, b) => a.severity - b.severity || b.units90d - a.units90d);
  return rows;
}

export async function getSalesHeatmap(supabase) {
  const { data } = await supabase.from("vw_monthly_sales").select("year, month, units");
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
