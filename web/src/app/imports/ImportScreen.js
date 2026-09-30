"use client";

import { useState } from "react";
import { theme } from "../dashboard/theme";

export default function ImportScreen() {
  const [catalogFile, setCatalogFile] = useState(null);
  const [salesFile, setSalesFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function handleRun(e) {
    e.preventDefault();
    if (!catalogFile && !salesFile) {
      setError("Choose at least one file.");
      return;
    }
    setError("");
    setResult(null);
    setBusy(true);

    const formData = new FormData();
    if (catalogFile) formData.append("catalog", catalogFile);
    if (salesFile) formData.append("sales", salesFile);

    const res = await fetch("/api/imports/run", { method: "POST", body: formData });
    const body = await res.json();
    setBusy(false);

    if (!res.ok) {
      setError(body.error || "Import failed.");
      return;
    }
    setResult(body);
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="rounded-lg border p-4" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
        <p className="mb-3 text-xs" style={{ color: theme.textMuted }}>
          CSV only. Column names are matched flexibly (e.g. &quot;SKU&quot;, &quot;Item Code&quot;, &quot;Price&quot;,
          &quot;Qty&quot; are all recognized) - export your spreadsheet as CSV first if it isn&apos;t already.
        </p>

        <form onSubmit={handleRun} className="flex flex-col gap-4">
          <FileField
            label="Product catalog"
            hint="Columns: sku, name, category, brand, supplier, unit_cost, unit_price, reorder_point, opening_stock"
            file={catalogFile}
            onChange={setCatalogFile}
          />
          <FileField
            label="Sales records"
            hint="Columns: date, sku, quantity, unit_price, unit_cost (price/cost backfill from the catalog if left blank)"
            file={salesFile}
            onChange={setSalesFile}
          />

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-fit rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: theme.accent, color: "#05230f" }}
          >
            {busy ? "Importing..." : "Run import"}
          </button>
        </form>
      </div>

      {result && (
        <div className="flex flex-col gap-4">
          {result.catalog && (
            <ResultCard title="Product catalog">
              <Stat label="Rows read" value={result.catalog.read} />
              <Stat label="New products inserted" value={result.catalog.inserted} />
              <Stat label="Existing products updated" value={result.catalog.updated} />
            </ResultCard>
          )}
          {result.sales && (
            <ResultCard title="Sales records">
              <Stat label="Rows read" value={result.sales.read} />
              <Stat label="Audited out (bad date/qty/price or unknown SKU)" value={result.sales.audited} />
              <Stat label="Loaded" value={result.sales.loaded} />
              <Stat label="Data Completeness Rate" value={`${result.sales.dcr}%`} />
              <Stat label="Duplicate Reduction Rate" value={`${result.sales.drr}%`} />
              <Stat label="Load Success Rate" value={`${result.sales.lsr}%`} />
            </ResultCard>
          )}
        </div>
      )}
    </div>
  );
}

function FileField({ label, hint, file, onChange }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm" style={{ color: theme.textPrimary }}>
        {label}
      </span>
      <span className="text-xs" style={{ color: theme.textMuted }}>
        {hint}
      </span>
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="mt-1 text-sm"
        style={{ color: theme.textSecondary }}
      />
      {file && (
        <span className="text-xs" style={{ color: theme.textSecondary }}>
          {file.name} ({(file.size / 1024).toFixed(1)} KB)
        </span>
      )}
    </label>
  );
}

function ResultCard({ title, children }) {
  return (
    <div className="rounded-lg border p-4" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
      <h2 className="mb-2 text-sm font-semibold" style={{ color: theme.textPrimary }}>
        {title}
      </h2>
      <dl className="flex flex-col gap-1 text-sm">{children}</dl>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="flex justify-between">
      <dt style={{ color: theme.textSecondary }}>{label}</dt>
      <dd className="tabular-nums" style={{ color: theme.textPrimary }}>
        {value}
      </dd>
    </div>
  );
}
