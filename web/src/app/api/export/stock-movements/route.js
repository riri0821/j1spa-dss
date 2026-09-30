import { requireOwner } from "@/lib/requireOwner";
import { createClient } from "@/lib/supabase/server";
import { toCsv, csvResponse } from "@/lib/csv";

const COLUMNS = [
  { key: "movement_id", label: "movement_id" },
  { key: "date", label: "date" },
  { key: "sku", label: "sku" },
  { key: "name", label: "name" },
  { key: "movement_type", label: "movement_type" },
  { key: "quantity", label: "quantity" },
  { key: "balance_after", label: "balance_after" },
  { key: "reference", label: "reference" },
  { key: "note", label: "note" },
];

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
    .from("stock_movements")
    .select("movement_id, movement_ts, sku, movement_type, quantity, balance_after, reference, note, products(name)")
    .gte("movement_ts", `${start}T00:00:00Z`)
    .lt("movement_ts", endExclusive)
    .order("movement_id");

  if (error) return Response.json({ error: error.message }, { status: 400 });

  const rows = (data ?? []).map((r) => ({
    movement_id: r.movement_id,
    date: r.movement_ts,
    sku: r.sku,
    name: r.products?.name,
    movement_type: r.movement_type,
    quantity: r.quantity,
    balance_after: r.balance_after,
    reference: r.reference,
    note: r.note,
  }));

  const csv = toCsv(COLUMNS, rows);
  return csvResponse(`stock-movements-${start}-to-${end}.csv`, csv);
}
