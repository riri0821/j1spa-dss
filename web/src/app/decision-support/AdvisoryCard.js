"use client";

import { useState } from "react";
import { theme, CATEGORICAL } from "../dashboard/theme";

export default function AdvisoryCard({ advisory: a, typeLabel, severityColor }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border p-4" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="rounded px-2 py-0.5 text-xs font-medium"
            style={{ backgroundColor: `${severityColor}22`, color: severityColor }}
          >
            {typeLabel}
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

      <div className="mt-2 flex items-start justify-between gap-4">
        <p className="text-sm" style={{ color: theme.textSecondary }}>
          {a.message}
        </p>
        <button
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 text-xs font-medium hover:underline"
          style={{ color: CATEGORICAL[0] }}
        >
          Why? {open ? "▲" : "▼"}
        </button>
      </div>

      {open && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: theme.textMuted }}>
          {a.rules.map((r) => (
            <li key={r.id}>
              <span style={{ color: r.result ? severityColor : theme.textMuted }}>{r.id}</span> {r.expr} →{" "}
              {r.result ? "TRUE" : "FALSE"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
