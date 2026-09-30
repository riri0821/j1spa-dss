// Validated status/delta tokens from the dataviz skill's reference palette
// (references/palette.md) - "delta up good" ink, status "critical" red.
const DELTA_UP = "#0ca30c";
const DELTA_DOWN = "#d03b3b";

export default function StatTile({ label, value, deltaPct, deltaSuffix = "pt" }) {
  const hasDelta = deltaPct !== null && deltaPct !== undefined;
  const isUp = hasDelta && deltaPct >= 0;

  return (
    <div className="rounded border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-black dark:text-zinc-50">{value}</p>
      {hasDelta && (
        <p className="mt-1 text-xs font-medium tabular-nums" style={{ color: isUp ? DELTA_UP : DELTA_DOWN }}>
          {isUp ? "▲" : "▼"} {Math.abs(deltaPct)}
          {deltaSuffix} vs prior period
        </p>
      )}
    </div>
  );
}
