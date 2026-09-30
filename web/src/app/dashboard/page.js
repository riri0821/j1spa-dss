import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getKpis, getProductPerformance, getSalesHeatmap } from "@/lib/analytics";
import SignOutButton from "@/components/SignOutButton";
import StatTile from "./StatTile";
import PerformanceTable from "./PerformanceTable";
import SalesHeatmap from "./SalesHeatmap";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "owner") redirect("/sales");

  const [kpis, performance, heatmap] = await Promise.all([
    getKpis(supabase),
    getProductPerformance(supabase),
    getSalesHeatmap(supabase),
  ]);

  return (
    <div className="flex min-h-screen flex-col gap-6 bg-zinc-50 p-8 font-sans dark:bg-black">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Owner Dashboard</h1>
        <div className="flex items-center gap-3">
          <p className="text-sm text-zinc-500">{profile.full_name}</p>
          <SignOutButton />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {[
          ["/products", "Manage products"],
          ["/sales", "Record a sale"],
          ["/stockin", "Stock-in"],
          ["/forecasting", "Forecasting"],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="w-fit rounded border border-zinc-300 px-4 py-2 text-sm text-black hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            {label}
          </a>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          label="Gross profit margin (90d)"
          value={`${kpis.grossProfitMarginPct}%`}
          deltaPct={kpis.grossProfitMarginDeltaPct}
        />
        <StatTile
          label="Today's gross profit"
          value={kpis.todayProfit.toFixed(2)}
          deltaPct={kpis.todayProfitDeltaPct}
          deltaSuffix="%"
        />
        <StatTile label="Active SKUs" value={kpis.skuCount} />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Sales trend (units/month)
        </h2>
        <SalesHeatmap years={heatmap.years} cells={heatmap.cells} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Product performance (trailing 90 days)
        </h2>
        <PerformanceTable rows={performance} />
      </section>
    </div>
  );
}
