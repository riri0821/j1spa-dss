import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { theme } from "../dashboard/theme";
import Sidebar from "../dashboard/Sidebar";
import ForecastWorkspace from "./ForecastWorkspace";

export default async function ForecastingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (profile?.role !== "owner") redirect("/sales");

  const { data: products } = await supabase
    .from("products")
    .select("sku, name")
    .eq("is_active", true)
    .order("name");

  return (
    <div className="flex h-screen overflow-hidden font-sans" style={{ backgroundColor: theme.pageBg }}>
      <Sidebar active="forecasting" fullName={profile.full_name} role={profile.role} />
      <main className="flex-1 overflow-y-auto p-8">
        <h1 className="text-xl font-semibold" style={{ color: theme.textPrimary }}>
          Time-Series Demand Forecasting Workspace
        </h1>
        <p className="mb-6 text-sm" style={{ color: theme.textMuted }}>
          Compare five forecasting models per item over a chosen horizon.
        </p>
        <ForecastWorkspace products={products ?? []} />
      </main>
    </div>
  );
}
