import { theme } from "./theme";
import Sparkline from "./Sparkline";

// One card: the primary KPI as the hero number with a trend sparkline,
// supporting KPIs beneath it. No icons, no card shadow -- the number carries
// the hierarchy and shadow is reserved for floating layers.
export default function HeroStatCard({ label, value, deltaText, trend = [], secondary = [] }) {
  return (
    <div
      className="flex flex-col justify-between rounded-lg border p-6"
      style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
    >
      <div>
        <p className="text-sm" style={{ color: theme.textSecondary }}>
          {label}
        </p>
        <div className="mt-2 flex items-center justify-between gap-4">
          <p
            className="shrink-0 text-5xl font-bold leading-none tracking-tight tabular-nums xl:text-6xl"
            style={{ color: theme.textPrimary }}
          >
            {value}
          </p>
          <div className="min-w-0 max-w-[45%] flex-1">
            <Sparkline data={trend} />
          </div>
        </div>
        {deltaText && (
          <p className="mt-4 text-sm tabular-nums" style={{ color: theme.textSecondary }}>
            {deltaText}
          </p>
        )}
      </div>

      {secondary.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-x-10 gap-y-4 border-t pt-5" style={{ borderColor: theme.border }}>
          {secondary.map((s) => {
            const body = (
              <>
                <p className="text-sm" style={{ color: theme.textSecondary }}>
                  {s.label}
                </p>
                <p className="mt-1 text-2xl font-bold leading-none tabular-nums" style={{ color: theme.textPrimary }}>
                  {s.value}
                </p>
              </>
            );
            return s.href ? (
              <a key={s.label} href={s.href} className="block min-w-0">
                {body}
              </a>
            ) : (
              <div key={s.label} className="min-w-0">
                {body}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
