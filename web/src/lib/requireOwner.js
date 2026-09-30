import { createClient } from "@/lib/supabase/server";

/** Returns { user, profile } if the caller is a signed-in owner, otherwise
 * { error: NextResponse } to return directly from the route handler. */
export async function requireOwner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: Response.json({ error: "Not signed in." }, { status: 401 }) };
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "owner") {
    return { error: Response.json({ error: "Owner access only." }, { status: 403 }) };
  }

  return { user, profile };
}
