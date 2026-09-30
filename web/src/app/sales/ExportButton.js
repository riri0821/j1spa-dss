"use client";

import { useEffect, useState } from "react";
import { theme } from "../dashboard/theme";

const PRESETS = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "custom", label: "Custom range" },
];

function pad(n) {
  return String(n).padStart(2, "0");
}

function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function computeRange(preset) {
  const now = new Date();
  if (preset === "today") {
    const s = toDateStr(now);
    return { start: s, end: s };
  }
  if (preset === "week") {
    const mondayOffset = (now.getDay() + 6) % 7; // days since Monday
    const start = new Date(now);
    start.setDate(now.getDate() - mondayOffset);
    return { start: toDateStr(start), end: toDateStr(now) };
  }
  if (preset === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: toDateStr(start), end: toDateStr(now) };
  }
  if (preset === "year") {
    const start = new Date(now.getFullYear(), 0, 1);
    return { start: toDateStr(start), end: toDateStr(now) };
  }
  return null;
}

// Owner-only action, rendered on Sales Entry (the page both roles share):
// staff see the same button, disabled, rather than it just disappearing -
// the server-side requireOwner() check on every /api/export/* route is
// the real gate, this is just the UI affordance matching it.
export default function ExportButton({ role }) {
  const isOwner = role === "owner";
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const range = preset === "custom" ? { start: customStart, end: customEnd } : computeRange(preset);

  function download(path) {
    if (!range?.start || !range?.end) {
      setError("Pick a custom start and end date first.");
      return;
    }
    if (range.start > range.end) {
      setError("Start date must be before end date.");
      return;
    }
    setError("");
    // Not a page navigation - this URL is a CSV file download
    // (Content-Disposition: attachment), so the browser saves it instead
    // of leaving the page.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `${path}?start=${range.start}&end=${range.end}`;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => isOwner && setOpen(true)}
        disabled={!isOwner}
        title={isOwner ? undefined : "Owner access only"}
        className="rounded px-4 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
        style={{ backgroundColor: theme.accent, color: "#05230f" }}
      >
        Export
      </button>

      {open && isOwner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div
            className="flex w-full max-w-lg flex-col gap-4 rounded-lg border p-5"
            style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-semibold" style={{ color: theme.textPrimary }}>
                Export
              </h2>
              <button type="button" onClick={() => setOpen(false)} className="text-sm" style={{ color: theme.textMuted }}>
                Close
              </button>
            </div>

            <div className="rounded-lg border p-4" style={{ borderColor: theme.border, backgroundColor: theme.cardBgAlt }}>
              <h3 className="mb-1 text-sm font-semibold" style={{ color: theme.textPrimary }}>
                Sales &amp; stock movements
              </h3>
              <p className="mb-3 text-xs" style={{ color: theme.textMuted }}>
                Pick a range, then export either file as CSV.
              </p>

              <div className="mb-4 flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPreset(p.key)}
                    className="rounded border px-3 py-1.5 text-xs font-medium"
                    style={
                      preset === p.key
                        ? { backgroundColor: theme.accent, color: "#05230f", borderColor: theme.accent }
                        : { borderColor: theme.border, color: theme.textSecondary }
                    }
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {preset === "custom" && (
                <div className="mb-4 flex items-center gap-2 text-sm" style={{ color: theme.textSecondary }}>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="rounded border px-2 py-1"
                    style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.textPrimary }}
                  />
                  <span>to</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="rounded border px-2 py-1"
                    style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.textPrimary }}
                  />
                </div>
              )}

              {range?.start && range?.end && (
                <p className="mb-3 text-xs" style={{ color: theme.textMuted }}>
                  Range: {range.start} to {range.end}
                </p>
              )}

              {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => download("/api/export/sales")}
                  className="rounded px-4 py-1.5 text-sm font-medium"
                  style={{ backgroundColor: theme.accent, color: "#05230f" }}
                >
                  Export sales (CSV)
                </button>
                <button
                  type="button"
                  onClick={() => download("/api/export/stock-movements")}
                  className="rounded border px-4 py-1.5 text-sm font-medium"
                  style={{ borderColor: theme.border, color: theme.textSecondary }}
                >
                  Export stock movements (CSV)
                </button>
              </div>
            </div>

            <div className="rounded-lg border p-4" style={{ borderColor: theme.border, backgroundColor: theme.cardBgAlt }}>
              <h3 className="mb-1 text-sm font-semibold" style={{ color: theme.textPrimary }}>
                Product catalog
              </h3>
              <p className="mb-3 text-xs" style={{ color: theme.textMuted }}>
                A full snapshot of current products - no date range, always exports everything as of now.
              </p>
              <a
                href="/api/export/products"
                className="inline-block rounded px-4 py-1.5 text-sm font-medium"
                style={{ backgroundColor: theme.accent, color: "#05230f" }}
              >
                Export catalog (CSV)
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
