// Status palette (fixed, from the dataviz skill's references/palette.md) -
// reserved for state, never reused as a series color. Always paired with
// the status text label, never color alone.
const STATUS_COLOR = {
  "Low stock": "#d03b3b", // critical
  Overstocked: "#fab219", // warning
  Stable: "#0ca30c", // good
};

// Ordinal sequential-blue steps (A = strongest) for the ABC revenue-share
// tier - a small swatch beside the always-visible letter, not a color-only
// encoding.
const ABC_COLOR = { A: "#256abf", B: "#5598e7", C: "#9ec5f4" };

export default function PerformanceTable({ rows }) {
  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">No active products yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-100 dark:bg-zinc-900">
          <tr>
            <th className="px-3 py-2">SKU</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Category</th>
            <th className="px-3 py-2">Class</th>
            <th className="px-3 py-2">Movement</th>
            <th className="px-3 py-2 text-right">Stock</th>
            <th className="px-3 py-2 text-right">Reorder pt</th>
            <th className="px-3 py-2 text-right">Units (90d)</th>
            <th className="px-3 py-2 text-right">Revenue (90d)</th>
            <th className="px-3 py-2 text-right">Gross profit (90d)</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.sku} className="border-t border-zinc-200 dark:border-zinc-800">
              <td className="px-3 py-2 font-mono">{r.sku}</td>
              <td className="px-3 py-2">{r.name}</td>
              <td className="px-3 py-2">{r.category}</td>
              <td className="px-3 py-2">
                <span
                  className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                  style={{ backgroundColor: ABC_COLOR[r.abcClass] }}
                />
                {r.abcClass}
              </td>
              <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{r.movement}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.stockOnHand}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.reorderPoint}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.units90d}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.revenue90d.toFixed(2)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.grossProfit90d.toFixed(2)}</td>
              <td className="px-3 py-2">
                <span
                  className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                  style={{ backgroundColor: STATUS_COLOR[r.status] }}
                />
                {r.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
