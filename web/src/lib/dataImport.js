/**
 * Historical data import - column mapping + data-quality metrics, ported
 * from app/etl/historical_import.py + app/etl/common.py. Runs against
 * CSV only (not .xlsx/.xls like the original): the npm `xlsx` package has
 * an unpatched prototype-pollution/ReDoS vulnerability, unacceptable for
 * parsing untrusted uploads. Ask the user to export as CSV instead.
 *
 * Also, unlike the original (which only matched sales rows against the
 * catalog file uploaded in the same run), sales SKUs are matched against
 * the catalog file OR existing products already in the database - a
 * sales-only re-import without re-uploading the catalog every time is a
 * reasonable thing to want and the original's stricter behavior would
 * silently drop everything in that case.
 */
export const CRITICAL_SALE_FIELDS = ["sku", "quantity", "unit_price", "unit_cost", "txn_date"];

export const CATALOG_COLS = {
  sku: ["sku", "item_code", "code", "product_code"],
  name: ["name", "description", "item_name", "product_name"],
  category: ["category", "cat", "group"],
  brand: ["brand", "make"],
  supplier: ["supplier", "vendor"],
  vehicle_compat: ["vehicle_compat", "compatibility", "fitment"],
  unit_cost: ["unit_cost", "cost", "buy_price"],
  unit_price: ["unit_price", "price", "srp", "sell_price"],
  reorder_point: ["reorder_point", "rop", "min_stock"],
  opening_stock: ["opening_stock", "on_hand", "stock", "qty_on_hand"],
};

export const SALES_COLS = {
  txn_date: ["date", "txn_date", "sale_date", "transaction_date"],
  sku: ["sku", "item_code", "code", "product_code"],
  quantity: ["quantity", "qty", "units", "qty_sold"],
  unit_price: ["unit_price", "price", "sell_price"],
  unit_cost: ["unit_cost", "cost"],
};

export function stdText(v) {
  if (v === undefined || v === null) return "";
  return String(v).trim().replace(/\s+/g, " ");
}

function normalizeHeader(h) {
  return h.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function mapColumns(records, mapping) {
  if (records.length === 0) return [];
  // Union of keys across all rows, not just the first - csv-parse gives
  // every row the same keys, but this stays robust if that ever isn't true.
  const lowerToOriginal = {};
  for (const row of records) {
    for (const key of Object.keys(row)) {
      lowerToOriginal[normalizeHeader(key)] = key;
    }
  }
  return records.map((row) => {
    const out = {};
    for (const [target, aliases] of Object.entries(mapping)) {
      const foundKey = aliases.find((a) => a in lowerToOriginal);
      out[target] = foundKey ? row[lowerToOriginal[foundKey]] : undefined;
    }
    return out;
  });
}

export function parseDate(v) {
  const s = stdText(v);
  if (!s) return null;
  const iso = new Date(s);
  if (!isNaN(iso.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(s)) return iso.toISOString().slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) {
    const mm = Number(m[1]), dd = Number(m[2]), yyyy = m[3];
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }
  }
  return null;
}

export function toNumber(v) {
  const s = stdText(v);
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export function dataCompletenessRate(rows, criticalFields) {
  if (rows.length === 0) return 100;
  const complete = rows.filter((r) => criticalFields.every((f) => r[f] !== null && r[f] !== undefined && stdText(r[f]) !== ""));
  return round2((complete.length / rows.length) * 100);
}

export function duplicateReductionRate(rawCount, dedupCount) {
  if (rawCount === 0) return 0;
  return round2(((rawCount - dedupCount) / rawCount) * 100);
}

export function loadSuccessRate(transformed, loaded) {
  if (transformed === 0) return 100;
  return round2((loaded / transformed) * 100);
}

export function dedupeSalesRows(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const key = `${r.txn_date}|${r.sku}|${r.quantity}|${r.unit_price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** Normalizes raw mapped catalog rows: standardized text, numeric coercion,
 * keyed by SKU (last row wins on duplicate SKU within the file). */
export function normalizeCatalogRows(mapped) {
  const bySku = new Map();
  for (const r of mapped) {
    const sku = stdText(r.sku).toUpperCase();
    if (!sku) continue;
    bySku.set(sku, {
      sku,
      name: stdText(r.name) || sku,
      category: stdText(r.category) || "Uncategorized",
      brand: stdText(r.brand) || "Generic",
      supplier: stdText(r.supplier) || "Unknown",
      vehicle_compat: stdText(r.vehicle_compat) || null,
      unit_cost: toNumber(r.unit_cost) ?? 0,
      unit_price: toNumber(r.unit_price) ?? 0,
      reorder_point: Math.trunc(toNumber(r.reorder_point) ?? 0),
      opening_stock: Math.trunc(toNumber(r.opening_stock) ?? 0),
    });
  }
  return bySku;
}

/** Normalizes raw mapped sales rows (no filtering/backfill yet - that
 * needs the catalog lookup, done by the caller). */
export function normalizeSalesRows(mapped) {
  return mapped.map((r) => ({
    sku: stdText(r.sku).toUpperCase(),
    txn_date: parseDate(r.txn_date),
    quantity: toNumber(r.quantity),
    unit_price: toNumber(r.unit_price),
    unit_cost: toNumber(r.unit_cost),
  }));
}
