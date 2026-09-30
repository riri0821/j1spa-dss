// Sequential blue ramp, light->dark (dataviz skill references/palette.md).
// Step 100 also doubles as the "near zero" / no-data tone - it's allowed to
// recede toward the surface by design.
const STEPS = ["#cde2fb", "#86b6ef", "#3987e5", "#1c5cab", "#0d366b"];
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
    return <p className="text-sm text-zinc-500">No sales recorded yet.</p>;
  }

  const max = Math.max(...cells.map((c) => c.units));
  const byYearMonth = new Map(cells.map((c) => [`${c.year}-${c.month}`, c.units]));

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left text-zinc-500">Year</th>
              {MONTH_NAMES.map((m) => (
                <th key={m} className="px-2 py-1 text-center text-zinc-500">
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {years.map((year) => (
              <tr key={year}>
                <td className="px-2 py-1 font-medium text-zinc-700 dark:text-zinc-300">{year}</td>
                {MONTH_NAMES.map((_, i) => {
                  const month = i + 1;
                  const units = byYearMonth.get(`${year}-${month}`);
                  if (units === undefined) {
                    return <td key={month} className="border border-zinc-100 p-2 dark:border-zinc-900" />;
                  }
                  const step = STEPS[bucket(units, max)];
                  const textDark = bucket(units, max) >= 3;
                  return (
                    <td
                      key={month}
                      title={`${MONTH_NAMES[i]} ${year}: ${units} units`}
                      className="border border-zinc-100 p-2 text-center tabular-nums dark:border-zinc-900"
                      style={{ backgroundColor: step, color: textDark ? "#ffffff" : "#0b0b0b" }}
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
      <div className="flex items-center gap-1 text-xs text-zinc-500">
        <span>Fewer units</span>
        {STEPS.map((s) => (
          <span key={s} className="h-3 w-5 rounded-sm border border-zinc-200 dark:border-zinc-800" style={{ backgroundColor: s }} />
        ))}
        <span>More units</span>
      </div>
    </div>
  );
}
