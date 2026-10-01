"use client";

import { useEffect, useState } from "react";
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
  const [open, setOpen] = useState(false);

  // below md, the drawer sits over the page - block background scroll while it's open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close menu" : "Open menu"}
        className="fixed bottom-4 left-4 z-50 flex h-11 w-11 items-center justify-center rounded-full shadow-lg md:hidden"
        style={{ backgroundColor: theme.accent, color: "#05230f" }}
      >
        {open ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-64 shrink-0 flex-col justify-between border-r px-4 py-5 transition-transform duration-200 ease-in-out md:static md:z-auto md:w-56 md:translate-x-0 md:transition-none ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
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

      <div className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: theme.border }}>
        <div className="min-w-0">
          <p className="truncate text-sm" style={{ color: theme.textPrimary }} title={fullName}>
            {fullName}
          </p>
          <p className="text-xs capitalize" style={{ color: theme.textMuted }}>
            {role}
          </p>
        </div>
          <SignOutButton className="w-full rounded border border-white/10 px-2 py-1.5 text-center text-xs text-zinc-300 hover:bg-white/5" />
        </div>
      </aside>
    </>
  );
}
