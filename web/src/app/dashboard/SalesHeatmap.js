"use client";

import { Fragment, useState } from "react";
import { theme, SEQUENTIAL } from "./theme";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// bucket boundaries as a fraction of the observed max - matches bucket()
const THRESHOLDS = [0.15, 0.35, 0.6, 0.85, 1];

function bucket(units, max) {
  if (units <= 0 || max <= 0) return 0;
  const ratio = units / max;
  for (let i = 0; i < THRESHOLDS.length; i++) {
    if (ratio <= THRESHOLDS[i]) return i;
  }
  return THRESHOLDS.length - 1;
}

// Rounds to a "nice" number for the legend (30, not 33; 300, not 287) -
// the step size scales with magnitude so small shops (tens/month) and
// larger ones (thousands/month) both read cleanly.
function niceRound(n) {
  if (n <= 0) return 0;
  if (n < 20) return Math.round(n / 5) * 5;
  if (n < 100) return Math.round(n / 10) * 10;
  if (n < 500) return Math.round(n / 50) * 50;
  if (n < 5000) return Math.round(n / 100) * 100;
  return Math.round(n / 500) * 500;
}

function fmt(n) {
  return Math.round(n).toLocaleString();
}

export default function SalesHeatmap({ years, cells }) {
  const [hover, setHover] = useState(null); // { x, y, label, units }

  if (cells.length === 0) {
    return (
      <p className="text-sm" style={{ color: theme.textMuted }}>
        No sales recorded yet.
      </p>
    );
  }

  const unitsList = cells.map((c) => c.units);
  const max = Math.max(...unitsList);
  const min = Math.min(...unitsList);
  const avg = Math.round(unitsList.reduce((s, u) => s + u, 0) / unitsList.length);
  const byYearMonth = new Map(cells.map((c) => [`${c.year}-${c.month}`, c.units]));

  // 5 legend labels, one per bucket/color, rounded to nice numbers and
  // computed from the actual data's max (not a fixed scale - real volume
  // here is much smaller than a generic mockup range)
  const bounds = THRESHOLDS.map((t) => niceRound(t * max));
  const legendLabels = bounds.map((hi, i) => {
    if (i === bounds.length - 1) return `${fmt(bounds[i - 1])}+`;
    const lo = i === 0 ? 0 : bounds[i - 1];
    return `${fmt(lo)}–${fmt(hi)}`;
  });

  return (
    <div className="relative flex flex-col gap-3">
      <div className="flex gap-6 text-xs" style={{ color: theme.textSecondary }}>
        <Stat label="Min units sold" value={min} />
        <Stat label="Avg. units sold" value={avg} />
        <Stat label="Max units sold" value={max} />
      </div>

      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `36px repeat(12, minmax(0, 1fr))` }}
      >
        <div />
        {MONTH_NAMES.map((m) => (
          <div key={m} className="pb-1 text-center text-xs font-normal" style={{ color: theme.textMuted }}>
            {m}
          </div>
        ))}

        {years.map((year) => (
          <Fragment key={year}>
            <div className="flex items-center justify-end pr-2 text-xs font-medium" style={{ color: theme.textSecondary }}>
              {year}
            </div>
            {MONTH_NAMES.map((_, i) => {
              const month = i + 1;
              const units = byYearMonth.get(`${year}-${month}`);
              if (units === undefined) {
                return <div key={month} className="aspect-square rounded" style={{ backgroundColor: theme.cardBgAlt }} />;
              }
              const step = SEQUENTIAL[bucket(units, max)];
              return (
                <div
                  key={month}
                  className="aspect-square cursor-default rounded"
                  style={{ backgroundColor: step }}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const parentRect = e.currentTarget.closest(".relative").getBoundingClientRect();
                    setHover({
                      x: rect.left - parentRect.left + rect.width / 2,
                      y: rect.top - parentRect.top,
                      label: `${MONTH_NAMES[i]} ${year}`,
                      units,
                    });
                  }}
                  onMouseLeave={() => setHover(null)}
                />
              );
            })}
          </Fragment>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs" style={{ color: theme.textMuted }}>
        <span>Units sold:</span>
        {SEQUENTIAL.map((s, i) => (
          <span key={s} className="flex items-center gap-1">
            <span className="h-3 w-4 rounded-sm" style={{ backgroundColor: s }} />
            <span>{legendLabels[i]}</span>
          </span>
        ))}
      </div>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 w-max -translate-x-1/2 -translate-y-full whitespace-nowrap rounded border px-2 py-1 text-xs shadow-lg"
          style={{
            left: hover.x,
            top: hover.y - 6,
            backgroundColor: theme.cardBg,
            borderColor: theme.border,
            color: theme.textPrimary,
          }}
        >
          <div className="font-medium">{hover.label}</div>
          <div style={{ color: theme.textSecondary }}>{fmt(hover.units)} units sold</div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-base font-semibold tabular-nums" style={{ color: theme.textPrimary }}>
        {value}
      </p>
      <p>{label}</p>
    </div>
  );
}
