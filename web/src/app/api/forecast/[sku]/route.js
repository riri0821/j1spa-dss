import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Server-to-server only: the forecast microservice's URL/key never reach
// the browser. Forecasting is owner-only, same as the original app.
export async function GET(request, { params }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "owner") {
    return NextResponse.json({ error: "Owner access only." }, { status: 403 });
  }

  const { sku } = await params;
  const horizon = request.nextUrl.searchParams.get("horizon");

  const url = new URL(`/forecast/${encodeURIComponent(sku)}`, process.env.FORECAST_SERVICE_URL);
  if (horizon) url.searchParams.set("horizon", horizon);

  let upstream;
  try {
    upstream = await fetch(url, {
      headers: { "X-Internal-Key": process.env.FORECAST_SERVICE_KEY },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Forecasting service is unreachable." }, { status: 502 });
  }

  const body = await upstream.json();
  return NextResponse.json(body, { status: upstream.status });
}
