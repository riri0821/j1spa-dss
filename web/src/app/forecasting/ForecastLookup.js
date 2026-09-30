"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function ForecastLookup() {
  const searchParams = useSearchParams();
  const initialSku = searchParams.get("sku") ?? "";

  const [sku, setSku] = useState(initialSku);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function runForecast(value) {
    if (!value.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);

    const res = await fetch(`/api/forecast/${encodeURIComponent(value.trim())}`);
    const body = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(body.error || body.detail || "Forecast request failed.");
      return;
    }
    setResult(body);
  }

  useEffect(() => {
    // Deep link from the dashboard's tracking table (?sku=...) - forecast
    // immediately instead of making the owner retype it.
    if (initialSku) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      runForecast(initialSku);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(e) {
    e.preventDefault();
    runForecast(sku);
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          placeholder="Enter a SKU"
          className="w-64 rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-black px-4 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-black"
        >
          {loading ? "Forecasting..." : "Forecast"}
        </button>
      </form>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {result && (
        <div className="flex flex-col gap-4">
          <div className="rounded border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-lg font-semibold text-black dark:text-zinc-50">
              {result.name} <span className="font-mono text-sm text-zinc-500">({result.sku})</span>
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <Stat label="Stock on hand" value={result.stock_on_hand} />
              <Stat label="Reorder point" value={result.reorder_point} />
              <Stat label="Forecast (30d)" value={result.forecast_30d} />
              <Stat
                label="Days to depletion"
                value={result.days_to_depletion ?? "-"}
                warn={result.stockout_risk}
              />
            </div>
            {result.stockout_risk && (
              <p className="mt-2 text-sm font-medium text-red-600 dark:text-red-400">
                Stockout risk within the forecast horizon.
              </p>
            )}
          </div>

          {result.insufficient_history ? (
            <p className="text-sm text-zinc-500">
              {result.reason || "Not enough history yet for a full model comparison - only Simple Moving Average is shown."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-100 dark:bg-zinc-900">
                  <tr>
                    <th className="px-3 py-2">Model</th>
                    <th className="px-3 py-2 text-right">MSE</th>
                    <th className="px-3 py-2 text-right">RMSE</th>
                    <th className="px-3 py-2 text-right">MAPE</th>
                    <th className="px-3 py-2 text-right">Next month</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(result.models ?? {}).map(([name, m]) => (
                    <tr
                      key={name}
                      className={`border-t border-zinc-200 dark:border-zinc-800 ${
                        m.chosen ? "bg-green-50 dark:bg-green-950" : ""
                      }`}
                    >
                      <td className="px-3 py-2">
                        {m.short} {m.chosen && <span className="text-green-700 dark:text-green-400">(chosen)</span>}
                      </td>
                      <td className="px-3 py-2 text-right">{m.mse}</td>
                      <td className="px-3 py-2 text-right">{m.rmse}</td>
                      <td className="px-3 py-2 text-right">{m.mape ?? "-"}</td>
                      <td className="px-3 py-2 text-right">{m.next}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.forecast_monthly?.length > 0 && (
            <div className="rounded border border-zinc-200 p-3 text-sm dark:border-zinc-800">
              <p className="mb-1 font-semibold text-zinc-700 dark:text-zinc-300">Monthly forecast</p>
              <ul className="flex flex-col gap-0.5">
                {result.forecast_monthly.map((m) => (
                  <li key={m.period}>
                    {m.label}: {m.units} units
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, warn }) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-base font-semibold ${warn ? "text-red-600 dark:text-red-400" : "text-black dark:text-zinc-50"}`}>
        {value}
      </p>
    </div>
  );
}
