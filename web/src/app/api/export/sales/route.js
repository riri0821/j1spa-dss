import { requireOwner } from "@/lib/requireOwner";
import { createClient } from "@/lib/supabase/server";
import { toCsv, csvResponse } from "@/lib/csv";

const COLUMNS = [
  { key: "sale_id", label: "sale_id" },
  { key: "date", label: "date" },
  { key: "sku", label: "sku" },
  { key: "name", label: "name" },
  { key: "quantity", label: "quantity" },
  { key: "unit_price", label: "unit_price" },
  { key: "unit_cost", label: "unit_cost" },
  { key: "line_revenue", label: "line_revenue" },
  { key: "note", label: "note" },
];

// One row per sale line item (matching the shape Data Import used to
// accept), filtered to confirmed sales in [start, end] inclusive.
export async function GET(request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (!start || !end) {
    return Response.json({ error: "start and end are required (YYYY-MM-DD)." }, { status: 400 });
  }
  const endExclusive = new Date(new Date(`${end}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000).toISOString();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sale_items")
    .select("sale_id, sku, quantity, unit_price, unit_cost, line_revenue, products(name), sales!inner(sale_ts, note, status)")
    .eq("sales.status", "confirmed")
    .gte("sales.sale_ts", `${start}T00:00:00Z`)
    .lt("sales.sale_ts", endExclusive)
    .order("sale_id");

  if (error) return Response.json({ error: error.message }, { status: 400 });

  const rows = (data ?? []).map((r) => ({
    sale_id: r.sale_id,
    date: r.sales?.sale_ts,
    sku: r.sku,
    name: r.products?.name,
    quantity: r.quantity,
    unit_price: r.unit_price,
    unit_cost: r.unit_cost,
    line_revenue: r.line_revenue,
    note: r.sales?.note,
  }));

  const csv = toCsv(COLUMNS, rows);
  return csvResponse(`sales-${start}-to-${end}.csv`, csv);
}
