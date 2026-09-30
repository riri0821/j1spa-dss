import { theme, DELTA_UP, DELTA_DOWN } from "./theme";

export default function StatTile({ icon, iconColor, label, value, deltaPct, deltaSuffix = "%", href }) {
  const hasDelta = deltaPct !== null && deltaPct !== undefined;
  const isUp = hasDelta && deltaPct >= 0;

  const body = (
    <div
      className="flex items-center gap-3 rounded-lg border px-4 py-3"
      style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
    >
      {icon && (
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-base"
          style={{ backgroundColor: `${iconColor}22`, color: iconColor }}
        >
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-lg font-semibold tabular-nums" style={{ color: theme.textPrimary }}>
          {value}
          {hasDelta && (
            <span className="ml-2 text-xs font-medium tabular-nums" style={{ color: isUp ? DELTA_UP : DELTA_DOWN }}>
              {isUp ? "▲" : "▼"} {Math.abs(deltaPct)}
              {deltaSuffix}
            </span>
          )}
        </p>
        <p className="truncate text-xs" style={{ color: theme.textSecondary }}>
          {label}
        </p>
      </div>
    </div>
  );

  return href ? (
    <a href={href} className="block">
      {body}
    </a>
  ) : (
    body
  );
}
