import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getKpis, getProductPerformance, summarizeDashboard } from "@/lib/analytics";
import { theme } from "./theme";
import Sidebar from "./Sidebar";
import StatTile from "./StatTile";
import Card from "./Card";
import GrossNetChart from "./GrossNetChart";
import BestSellingChart from "./BestSellingChart";
import StockByCategoryChart from "./StockByCategoryChart";
import TrackingTable from "./TrackingTable";

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

  const [kpis, performance] = await Promise.all([getKpis(supabase), getProductPerformance(supabase)]);
  const summary = summarizeDashboard(performance);

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden font-sans" style={{ backgroundColor: theme.pageBg }}>
      <Sidebar active="dashboard" fullName={profile.full_name} role={profile.role} />

      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: theme.textPrimary }}>
              Business Analytics &amp; Sales Intelligence
            </h1>
            <p className="text-sm" style={{ color: theme.textMuted }}>
              {profile.full_name} · Live data
            </p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile
            icon="₱"
            iconColor="#0ca30c"
            label="Gross profit margin"
            value={`${kpis.grossProfitMarginPct}%`}
            deltaPct={kpis.grossProfitMarginDeltaPct}
            deltaSuffix="pt"
          />
          <StatTile
            icon="▤"
            iconColor="#3987e5"
            label="Total units in stock"
            value={summary.totalUnitsInStock}
            href="/products"
          />
          <StatTile
            icon="!"
            iconColor="#d03b3b"
            label="Restocking items (critical)"
            value={summary.restockingCritical}
            href="/decision-support"
          />
        </div>

        <div className="mb-6 grid gap-4 lg:grid-cols-[1.15fr_1fr_1fr]">
          <Card title="Gross & Net Sales" subtitle="Sales + services combined">
            <GrossNetChart />
          </Card>
          <Card title="Top 5 Best-Selling Parts" subtitle="Trailing 90-day unit volume">
            <BestSellingChart data={summary.topSelling} />
          </Card>
          <Card title="Stock by Category" subtitle="Share of units on hand">
            <StockByCategoryChart data={summary.categoryTotals} />
          </Card>
        </div>

        <TrackingTable rows={performance} />
      </main>
    </div>
  );
}
