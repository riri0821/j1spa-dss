/**
 * Rule-based decision support (paper 3.6), ported from app/rules/engine.py.
 * Deterministic conditions evaluated against current stock balances.
 * Advisory only - writes to `alerts`, never changes stock/orders itself.
 *
 * Only needs a 3-month moving average (not ARIMA/Holt-Winters), so this
 * stays in Next.js/Postgres rather than calling the Python forecast
 * service - no heavy stats library needed for this one.
 */
const LEAD_TIME_DAYS = 30; // config.SUPPLIER_LEAD_TIME_DAYS
const SPIKE_THRESHOLD_PCT = 30.0; // config.SPIKE_THRESHOLD_PCT
const OVERSTOCK_DOS_DAYS = 90; // config.OVERSTOCK_DOS_DAYS

function round(n, d = 2) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Same gap-fill as getSalesHeatmap/monthly_series: a month with zero sales
// inside the SKU's own historical span is a real 0, not a missing point -
// skipping it would silently inflate the moving averages below.
function gapFilledUnits(rows) {
  if (rows.length === 0) return [];
  const sorted = [...rows].sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
  const map = new Map(sorted.map((r) => [`${r.year}-${r.month}`, Number(r.units)]));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const out = [];
  let y = first.year, m = first.month;
  while (y * 12 + m <= last.year * 12 + last.month) {
    out.push(map.get(`${y}-${m}`) ?? 0);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function forecastAndAvg(units) {
  if (units.length === 0) return { fc30: 0, avg12: 0 };
  const w = Math.min(3, units.length);
  const fc30 = round(units.slice(-w).reduce((s, v) => s + v, 0) / w);
  let avg12;
  if (units.length >= 4) {
    const slice = units.slice(-4, -1);
    avg12 = round(slice.reduce((s, v) => s + v, 0) / slice.length);
  } else {
    const slice = units.slice(0, -1);
    avg12 = slice.length ? round(slice.reduce((s, v) => s + v, 0) / slice.length) : 0;
  }
  return { fc30, avg12 };
}

function fmt(x) {
  return x === Infinity ? "∞" : String(Math.round(x));
}

function makeAdvisory(product, type, severity, title, message, recommendation, fc30, dtd, rules) {
  return {
    productId: product.product_id,
    sku: product.sku,
    name: product.name,
    type,
    severity,
    title,
    message,
    recommendation,
    onHand: product.stock_on_hand,
    reorderPoint: product.reorder_point,
    forecast30d: fc30,
    daysToDepletion: dtd === Infinity ? null : dtd,
    rules: rules.map(([id, expr, result]) => ({ id, expr, result })),
  };
}

export async function evaluateDecisionSupport(supabase) {
  const [{ data: velocityRows }, { data: products }] = await Promise.all([
    supabase.from("vw_product_velocity").select("sku, units_90d"),
    supabase.from("products").select("product_id, sku, name, stock_on_hand, reorder_point").eq("is_active", true),
  ]);

  const velocityMap = new Map((velocityRows ?? []).map((r) => [r.sku, Number(r.units_90d) || 0]));
  const nonZero = [...velocityMap.values()].filter((v) => v > 0);
  const velocityMedian = median(nonZero);

  const monthlyBySku = new Map();
  await Promise.all(
    (products ?? []).map(async (p) => {
      const { data } = await supabase.rpc("monthly_demand", { p_sku: p.sku });
      monthlyBySku.set(p.sku, gapFilledUnits(data ?? []));
    })
  );

  const advisories = [];
  for (const p of products ?? []) {
    const units = monthlyBySku.get(p.sku) ?? [];
    const { fc30, avg12 } = forecastAndAvg(units);
    const perDay = fc30 > 0 ? fc30 / 30 : 0;
    const dtd = perDay > 0 ? round(p.stock_on_hand / perDay, 1) : Infinity;
    const dos = dtd;
    const dev = avg12 > 0 ? round(((fc30 - avg12) / avg12) * 100, 1) : 0;
    const velocity = (velocityMap.get(p.sku) ?? 0) <= velocityMedian ? "Slow-Moving" : "Fast-Moving";

    // ---------- Low stock alert ----------
    const r01 = p.stock_on_hand <= p.reorder_point;
    const r02 = fc30 > p.stock_on_hand;
    const r03 = dtd < LEAD_TIME_DAYS;
    if (r01) {
      advisories.push(
        makeAdvisory(
          p,
          "low_stock",
          "critical",
          "Low Stock Alert",
          `Current stock (${p.stock_on_hand}), reorder point (${p.reorder_point}). Forecasted 30-day demand: ${Math.round(fc30)} units.`,
          "Reorder immediately",
          fc30,
          dtd,
          [
            ["R-01", `stock (${p.stock_on_hand}) ≤ ROP (${p.reorder_point})`, r01],
            ["R-02", `forecast_30d (${Math.round(fc30)}) > on_hand (${p.stock_on_hand})`, r02],
            ["R-03", `days_to_depletion (${fmt(dtd)}) < lead_time (${LEAD_TIME_DAYS})`, r03],
          ]
        )
      );
      continue;
    }

    // ---------- Demand spike warning ----------
    const r04 = fc30 > avg12 && avg12 > 0;
    const r05 = dev > SPIKE_THRESHOLD_PCT;
    if (r04 && r05) {
      advisories.push(
        makeAdvisory(
          p,
          "demand_spike",
          "warning",
          "Demand Spike Warning",
          `30-day forecast (${Math.round(fc30)} units), 12-week average (${Math.round(avg12)} units), up ${dev.toFixed(1)}%.`,
          "Monitor demand spike",
          fc30,
          dtd,
          [
            ["R-04", `forecast_30d (${Math.round(fc30)}) > avg_12w (${Math.round(avg12)})`, r04],
            ["R-05", `deviation_pct (${dev.toFixed(1)}%) > threshold (${SPIKE_THRESHOLD_PCT.toFixed(0)}%)`, r05],
          ]
        )
      );
      continue;
    }

    // ---------- Overstock advisory ----------
    const r07 = p.reorder_point > 0 && p.stock_on_hand > p.reorder_point * 3;
    const r08 = velocity === "Slow-Moving";
    const r09 = dos > OVERSTOCK_DOS_DAYS;
    if (r07 && (r08 || r09)) {
      advisories.push(
        makeAdvisory(
          p,
          "overstock",
          "warning",
          "Overstock Advisory",
          `Current balance of ${p.stock_on_hand} units with low recent sales.`,
          "Consider markdown",
          fc30,
          dtd,
          [
            ["R-07", `on_hand (${p.stock_on_hand}) > ROP×3 (${p.reorder_point * 3})`, r07],
            ["R-08", 'velocity_class = "Slow-Moving"', r08],
            ["R-09", `days_of_supply (${fmt(dos)}) > ${OVERSTOCK_DOS_DAYS}`, r09],
          ]
        )
      );
    }
  }

  const batchId = new Date().toISOString().replace(/\D/g, "").slice(0, 14);

  if (advisories.length > 0) {
    const rows = advisories.map((a) => ({
      batch_id: batchId,
      product_id: a.productId,
      sku: a.sku,
      product_name: a.name,
      alert_type: a.type,
      severity: a.severity,
      stock_on_hand: a.onHand,
      reorder_point: a.reorderPoint,
      forecast_30d: a.forecast30d,
      days_to_depletion: a.daysToDepletion,
      recommendation: a.recommendation,
      rule_trace: a.rules
        .map((r) => `${r.id} ${r.expr} -> ${r.result ? "TRUE" : "FALSE"}`)
        .join("; ")
        .slice(0, 255),
    }));
    await supabase.from("alerts").insert(rows);
  }

  const byType = {};
  for (const a of advisories) byType[a.type] = (byType[a.type] ?? 0) + 1;

  return {
    batchId,
    generatedAt: new Date().toISOString(),
    count: advisories.length,
    byType,
    advisories,
  };
}
