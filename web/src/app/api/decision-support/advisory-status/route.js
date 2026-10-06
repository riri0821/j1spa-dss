import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_TYPES = ["low_stock", "demand_spike", "overstock"];

// Sets (or, on an empty value, clears back to automatic) the owner's
// manual override of which advisory type shows for a SKU - takes
// priority over the rule engine's own evaluation in
// lib/decisionSupport.js, which still runs and is still shown, just
// outranked. See sql/supabase_add_advisory_overrides.sql.
export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json();
  const productId = Number(body.product_id);
  const manualType = (body.manual_type ?? "").trim();

  if (!productId) {
    return NextResponse.json({ error: "product_id is required." }, { status: 400 });
  }
  if (manualType && !VALID_TYPES.includes(manualType)) {
    return NextResponse.json({ error: "Invalid advisory type." }, { status: 400 });
  }

  if (!manualType) {
    const { error } = await supabase.from("advisory_overrides").delete().eq("product_id", productId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, product_id: productId, manual_type: null });
  }

  const { error } = await supabase
    .from("advisory_overrides")
    .upsert({ product_id: productId, manual_type: manualType, updated_by: user.id, updated_at: new Date().toISOString() });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, product_id: productId, manual_type: manualType });
}
