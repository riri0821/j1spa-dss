import { theme, SEQUENTIAL } from "./theme";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function bucket(units, max) {
  if (units <= 0 || max <= 0) return 0;
  const ratio = units / max;
  if (ratio <= 0.15) return 0;
  if (ratio <= 0.35) return 1;
  if (ratio <= 0.6) return 2;
  if (ratio <= 0.85) return 3;
  return 4;
}

export default function SalesHeatmap({ years, cells }) {
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-6 text-xs" style={{ color: theme.textSecondary }}>
        <Stat label="Min units sold" value={min} />
        <Stat label="Avg. units sold" value={avg} />
        <Stat label="Max units sold" value={max} />
      </div>

      <div className="overflow-x-auto">
        <table className="border-separate text-xs" style={{ borderSpacing: 3 }}>
          <thead>
            <tr>
              <th className="px-1 text-left" style={{ color: theme.textMuted }}></th>
              {MONTH_NAMES.map((m) => (
                <th key={m} className="px-1 pb-1 text-center font-normal" style={{ color: theme.textMuted }}>
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {years.map((year) => (
              <tr key={year}>
                <td className="pr-2 text-right font-medium" style={{ color: theme.textSecondary }}>
                  {year}
                </td>
                {MONTH_NAMES.map((_, i) => {
                  const month = i + 1;
                  const units = byYearMonth.get(`${year}-${month}`);
                  if (units === undefined) {
                    return <td key={month} className="h-8 w-11 rounded" style={{ backgroundColor: theme.cardBgAlt }} />;
                  }
                  const step = SEQUENTIAL[bucket(units, max)];
                  const dark = bucket(units, max) >= 3;
                  return (
                    <td
                      key={month}
                      title={`${MONTH_NAMES[i]} ${year}: ${units} units`}
                      className="h-8 w-11 rounded text-center tabular-nums"
                      style={{ backgroundColor: step, color: dark ? "#ffffff" : "#0b0b0b" }}
                    >
                      {units}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-1 text-xs" style={{ color: theme.textMuted }}>
        <span>Units sold:</span>
        {SEQUENTIAL.map((s) => (
          <span key={s} className="h-3 w-5 rounded-sm" style={{ backgroundColor: s }} />
        ))}
      </div>
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
