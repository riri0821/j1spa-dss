import { NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { requireOwner } from "@/lib/requireOwner";
import { createClient } from "@/lib/supabase/server";
import {
  CATALOG_COLS,
  SALES_COLS,
  CRITICAL_SALE_FIELDS,
  mapColumns,
  normalizeCatalogRows,
  normalizeSalesRows,
  dataCompletenessRate,
  duplicateReductionRate,
  loadSuccessRate,
  dedupeSalesRows,
} from "@/lib/dataImport";

const MAX_UPLOAD_MB = 50;

function parseCsv(text) {
  return parse(text, { columns: true, skip_empty_lines: true, trim: true });
}

async function readCsvFile(file) {
  if (!file) return null;
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    throw new Error(`${file.name} is larger than ${MAX_UPLOAD_MB}MB.`);
  }
  const text = await file.text();
  return parseCsv(text);
}

async function chunkedInsert(supabase, table, rows, chunkSize = 1000) {
  const inserted = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { data, error } = await supabase.from(table).insert(chunk).select();
    if (error) throw new Error(`Insert into ${table} failed: ${error.message}`);
    inserted.push(...data);
  }
  return inserted;
}

export async function POST(request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;

  const supabase = await createClient();

  let catalogRows, salesRows;
  try {
    const formData = await request.formData();
    const catalogFile = formData.get("catalog");
    const salesFile = formData.get("sales");
    if (!catalogFile && !salesFile) {
      return NextResponse.json({ error: "Upload at least one file (product catalog and/or sales records)." }, { status: 400 });
    }
    catalogRows = await readCsvFile(catalogFile instanceof File ? catalogFile : null);
    salesRows = await readCsvFile(salesFile instanceof File ? salesFile : null);
  } catch (err) {
    return NextResponse.json({ error: `Could not read the uploaded file(s): ${err.message}` }, { status: 400 });
  }

  const result = { catalog: null, sales: null };

  // ---------------- catalog ----------------
  let catalogLookup = new Map();
  if (catalogRows) {
    const mapped = mapColumns(catalogRows, CATALOG_COLS);
    catalogLookup = normalizeCatalogRows(mapped);
    const catalogEntries = [...catalogLookup.values()];

    const skus = catalogEntries.map((c) => c.sku);
    const { data: existing } = await supabase.from("products").select("sku").in("sku", skus.length ? skus : ["__none__"]);
    const existingSkus = new Set((existing ?? []).map((r) => r.sku));

    const toInsert = catalogEntries
      .filter((c) => !existingSkus.has(c.sku))
      .map((c) => ({
        sku: c.sku,
        name: c.name,
        category: c.category,
        brand: c.brand,
        supplier: c.supplier,
        vehicle_compat: c.vehicle_compat,
        unit_cost: c.unit_cost,
        unit_price: c.unit_price,
        reorder_point: c.reorder_point,
        stock_on_hand: c.opening_stock,
        source_type: "Historical Migration",
      }));
    const toUpdate = catalogEntries.filter((c) => existingSkus.has(c.sku));

    if (toInsert.length) await chunkedInsert(supabase, "products", toInsert);
    // stock_on_hand is deliberately left out of the update - a re-imported
    // catalog snapshot shouldn't clobber live stock, same rule as the
    // Products screen's own edit form.
    for (const c of toUpdate) {
      await supabase
        .from("products")
        .update({
          name: c.name,
          category: c.category,
          brand: c.brand,
          supplier: c.supplier,
          unit_cost: c.unit_cost,
          unit_price: c.unit_price,
          reorder_point: c.reorder_point,
        })
        .eq("sku", c.sku);
    }

    result.catalog = { read: catalogRows.length, inserted: toInsert.length, updated: toUpdate.length };
  }

  // ---------------- sales ----------------
  if (salesRows) {
    const mapped = mapColumns(salesRows, SALES_COLS);
    let normalized = normalizeSalesRows(mapped);
    const rawCount = normalized.length;
    const dcr = dataCompletenessRate(normalized, CRITICAL_SALE_FIELDS);

    // backfill missing price/cost from the catalog just uploaded, or
    // (unlike the original) from products already in the database
    const missingCostSkus = [...new Set(normalized.filter((r) => r.unit_cost === null || r.unit_price === null).map((r) => r.sku))];
    const { data: dbProducts } = await supabase
      .from("products")
      .select("sku, unit_cost, unit_price")
      .in("sku", missingCostSkus.length ? missingCostSkus : ["__none__"]);
    const dbLookup = new Map((dbProducts ?? []).map((p) => [p.sku, p]));

    normalized = normalized.map((r) => {
      const fallback = catalogLookup.get(r.sku) ?? dbLookup.get(r.sku);
      return {
        ...r,
        unit_price: r.unit_price ?? fallback?.unit_price ?? null,
        unit_cost: r.unit_cost ?? fallback?.unit_cost ?? null,
      };
    });

    const audit = normalized.filter((r) => !r.txn_date || r.quantity === null || r.quantity <= 0 || r.unit_price === null || r.unit_cost === null);
    let clean = normalized.filter((r) => r.txn_date && r.quantity !== null && r.quantity > 0 && r.unit_price !== null && r.unit_cost !== null);

    // needs to resolve to a real product_id to insert sale_items
    const { data: allKnownProducts } = await supabase
      .from("products")
      .select("product_id, sku")
      .in("sku", [...new Set(clean.map((r) => r.sku))].length ? [...new Set(clean.map((r) => r.sku))] : ["__none__"]);
    const productIdBySku = new Map((allKnownProducts ?? []).map((p) => [p.sku, p.product_id]));
    clean = clean.filter((r) => productIdBySku.has(r.sku));

    const dedupCount = dedupeSalesRows(clean).length;
    clean = dedupeSalesRows(clean);
    const drr = duplicateReductionRate(rawCount, dedupCount + audit.length);

    const salesToInsert = clean.map((r) => ({
      sale_ts: `${r.txn_date}T12:00:00+08:00`,
      user_id: auth.user.id,
      user_role: "owner",
      total_amount: Math.round(r.quantity * r.unit_price * 100) / 100,
      total_cost: Math.round(r.quantity * r.unit_cost * 100) / 100,
      status: "confirmed",
      source_type: "Historical Migration",
    }));

    let loaded = 0;
    if (salesToInsert.length) {
      const insertedSales = await chunkedInsert(supabase, "sales", salesToInsert, 1000);
      const items = insertedSales.map((s, i) => ({
        sale_id: s.sale_id,
        product_id: productIdBySku.get(clean[i].sku),
        sku: clean[i].sku,
        quantity: clean[i].quantity,
        unit_price: clean[i].unit_price,
        unit_cost: clean[i].unit_cost,
        line_revenue: Math.round(clean[i].quantity * clean[i].unit_price * 100) / 100,
        line_cost: Math.round(clean[i].quantity * clean[i].unit_cost * 100) / 100,
      }));
      await chunkedInsert(supabase, "sale_items", items, 1000);
      loaded = insertedSales.length;
    }

    const lsr = loadSuccessRate(clean.length, loaded);
    result.sales = { read: rawCount, audited: audit.length, loaded, dcr, drr, lsr };
  }

  return NextResponse.json({ ok: true, ...result });
}
