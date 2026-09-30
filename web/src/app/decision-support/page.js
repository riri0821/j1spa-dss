import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { evaluateDecisionSupport } from "@/lib/decisionSupport";
import { theme, STATUS } from "../dashboard/theme";
import Sidebar from "../dashboard/Sidebar";
import RefreshButton from "../dashboard/RefreshButton";

const TYPE_LABEL = {
  low_stock: "Low stock",
  demand_spike: "Demand spike",
  overstock: "Overstock",
};

// Advisory severity uses the same reserved status hexes as the dashboard's
// Low stock/Overstocked/Stable badges (dataviz skill) - "critical" maps to
// the same red as "Low stock" there, "warning" to the same amber.
const SEVERITY_COLOR = {
  critical: STATUS["Low stock"],
  warning: STATUS.Overstocked,
  info: STATUS.Stable,
};

export default async function DecisionSupportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (profile?.role !== "owner") redirect("/sales");

  const result = await evaluateDecisionSupport(supabase);

  return (
    <div className="flex min-h-screen font-sans" style={{ backgroundColor: theme.pageBg }}>
      <Sidebar active="decision-support" fullName={profile.full_name} role={profile.role} />

      <main className="flex-1 overflow-y-auto p-8">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: theme.textPrimary }}>
              Decision Support Advisories
            </h1>
            <p className="text-sm" style={{ color: theme.textMuted }}>
              Advisory only - the system makes no automatic reorder or pricing changes.
            </p>
          </div>
          <RefreshButton />
        </div>

        <div className="mb-6 flex gap-3">
          <SummaryChip label="Low stock" count={result.byType.low_stock ?? 0} color={SEVERITY_COLOR.critical} />
          <SummaryChip label="Demand spike" count={result.byType.demand_spike ?? 0} color={SEVERITY_COLOR.warning} />
          <SummaryChip label="Overstock" count={result.byType.overstock ?? 0} color={SEVERITY_COLOR.warning} />
        </div>

        {result.advisories.length === 0 ? (
          <p style={{ color: theme.textMuted }}>No advisories right now - nothing needs attention.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {result.advisories.map((a) => (
              <div
                key={`${a.sku}-${a.type}`}
                className="rounded-lg border p-4"
                style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded px-2 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: `${SEVERITY_COLOR[a.severity]}22`, color: SEVERITY_COLOR[a.severity] }}
                    >
                      {TYPE_LABEL[a.type]}
                    </span>
                    <span className="font-mono text-sm" style={{ color: theme.textSecondary }}>
                      {a.sku}
                    </span>
                    <span className="text-sm" style={{ color: theme.textPrimary }}>
                      {a.name}
                    </span>
                  </div>
                  <span className="text-xs font-medium" style={{ color: theme.textSecondary }}>
                    {a.recommendation}
                  </span>
                </div>
                <p className="mt-2 text-sm" style={{ color: theme.textSecondary }}>
                  {a.message}
                </p>
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: theme.textMuted }}>
                  {a.rules.map((r) => (
                    <li key={r.id}>
                      <span style={{ color: r.result ? SEVERITY_COLOR[a.severity] : theme.textMuted }}>{r.id}</span>{" "}
                      {r.expr} → {r.result ? "TRUE" : "FALSE"}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function SummaryChip({ label, count, color }) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg border px-4 py-2"
      style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-lg font-semibold tabular-nums" style={{ color: theme.textPrimary }}>
        {count}
      </span>
      <span className="text-xs" style={{ color: theme.textSecondary }}>
        {label}
      </span>
    </div>
  );
}
