import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/requireOwner";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });
  if (id === auth.user.id) {
    return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: target, error: fetchError } = await admin.from("profiles").select("is_active").eq("id", id).single();
  if (fetchError || !target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const { error } = await admin.from("profiles").update({ is_active: !target.is_active }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, is_active: !target.is_active });
}
