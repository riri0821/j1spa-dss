import { theme } from "./theme";

export default function Card({ title, subtitle, actions, children }) {
  return (
    <div
      className="flex flex-col rounded-lg border p-4"
      style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold" style={{ color: theme.textPrimary }}>
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs" style={{ color: theme.textMuted }}>
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      <div className={`min-h-0 flex-1 ${subtitle || actions ? "mt-3" : "mt-1"}`}>{children}</div>
    </div>
  );
}
