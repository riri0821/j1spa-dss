import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  if (!productId) {
    return NextResponse.json({ error: "product_id is required." }, { status: 400 });
  }

  const { data: product } = await supabase
    .from("products")
    .select("sku")
    .eq("product_id", productId)
    .single();
  if (!product) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  // A product with recorded sales, stock movements, or alerts can't be
  // hard-deleted without breaking that history, so it's deactivated
  // (hidden from active lists) instead - same rule as the original app.
  const [{ count: saleCount }, { count: movementCount }, { count: alertCount }] = await Promise.all([
    supabase.from("sale_items").select("*", { count: "exact", head: true }).eq("product_id", productId),
    supabase.from("stock_movements").select("*", { count: "exact", head: true }).eq("product_id", productId),
    supabase.from("alerts").select("*", { count: "exact", head: true }).eq("product_id", productId),
  ]);

  if (saleCount || movementCount || alertCount) {
    const { error } = await supabase
      .from("products")
      .update({ is_active: false })
      .eq("product_id", productId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({
      ok: true,
      mode: "deactivated",
      product_id: productId,
      message: `${product.sku} has recorded sales/stock history, so it was deactivated instead of deleted.`,
    });
  }

  const { error } = await supabase.from("products").delete().eq("product_id", productId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, mode: "deleted", product_id: productId, message: `${product.sku} deleted.` });
}
