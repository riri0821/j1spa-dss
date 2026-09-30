import { theme } from "./theme";
import SignOutButton from "@/components/SignOutButton";

const NAV = [
  {
    section: "Analytics",
    items: [
      { href: "/dashboard", label: "Dashboard", key: "dashboard" },
      { href: "/forecasting", label: "Forecasting", key: "forecasting" },
      { href: "/decision-support", label: "Decision Support", key: "decision-support" },
    ],
  },
  {
    section: "Operations",
    items: [
      { href: "/sales", label: "Sales Entry", key: "sales" },
      { href: "/stockin", label: "Stock In", key: "stockin" },
      { href: "/products", label: "Products", key: "products" },
    ],
  },
  {
    section: "System",
    items: [{ href: "/settings", label: "Settings", key: "settings" }],
  },
];

export default function Sidebar({ active = "dashboard", fullName, role }) {
  return (
    <aside
      className="flex h-screen w-56 shrink-0 flex-col justify-between border-r px-4 py-5"
      style={{ backgroundColor: theme.sidebarBg, borderColor: theme.border }}
    >
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-sm font-semibold" style={{ color: theme.textPrimary }}>
            J1SPA Analytics
          </p>
          <p className="text-xs" style={{ color: theme.textMuted }}>
            Decision Support System
          </p>
        </div>

        {NAV.map((group) => (
          <div key={group.section} className="flex flex-col gap-1">
            <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: theme.textMuted }}>
              {group.section}
            </p>
            {group.items.map((item) => {
              const isActive = item.key === active;
              return (
                <a
                  key={item.key}
                  href={item.href}
                  className="rounded px-2 py-1.5 text-sm"
                  style={
                    isActive
                      ? { backgroundColor: theme.accent, color: "#05230f", fontWeight: 600 }
                      : { color: theme.textSecondary }
                  }
                >
                  {item.label}
                </a>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: theme.border }}>
        <div>
          <p className="text-sm" style={{ color: theme.textPrimary }}>
            {fullName}
          </p>
          <p className="text-xs capitalize" style={{ color: theme.textMuted }}>
            {role}
          </p>
        </div>
        <SignOutButton className="rounded border border-white/10 px-2 py-1 text-xs text-zinc-300 hover:bg-white/5" />
      </div>
    </aside>
  );
}
