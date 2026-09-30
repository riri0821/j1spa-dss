"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { theme } from "../dashboard/theme";

const inputClass = "rounded border px-3 py-1.5 text-sm";
const inputStyle = { backgroundColor: theme.cardBgAlt, borderColor: theme.border, color: theme.textPrimary };

export default function StockInScreen() {
  const supabase = createClient();

  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [cart, setCart] = useState([]); // [{product_id, sku, name, stock_on_hand, qty}]
  const [reference, setReference] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [recorded, setRecorded] = useState(null);

  const searchProducts = useCallback(
    async (term) => {
      const safeTerm = term.replace(/[,()]/g, "");
      let query = supabase
        .from("products")
        .select("product_id, sku, name, brand, stock_on_hand, reorder_point")
        .eq("is_active", true)
        .order("name")
        .limit(100);
      if (safeTerm) {
        query = query.or(`name.ilike.%${safeTerm}%,sku.ilike.%${safeTerm}%,brand.ilike.%${safeTerm}%`);
      }
      const { data } = await query;
      setResults(data ?? []);
    },
    [supabase]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    searchProducts("");
  }, [searchProducts]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    searchProducts(search);
  }

  function addToCart(p) {
    setCart((prev) => {
      if (prev.some((l) => l.product_id === p.product_id)) return prev;
      return [...prev, { ...p, qty: 1 }];
    });
  }

  function setQty(product_id, qty) {
    const n = Number(qty);
    setCart((prev) => prev.map((l) => (l.product_id === product_id ? { ...l, qty: Number.isFinite(n) ? n : 0 } : l)));
  }

  function removeFromCart(product_id) {
    setCart((prev) => prev.filter((l) => l.product_id !== product_id));
  }

  async function handleConfirm() {
    const items = cart.filter((l) => l.qty !== 0).map((l) => ({ product_id: l.product_id, qty: l.qty }));
    if (items.length === 0) {
      setError("No non-zero quantities to record.");
      return;
    }
    setError("");
    setRecorded(null);
    setConfirming(true);

    const { data, error: rpcError } = await supabase.rpc("record_stock_movements", {
      items,
      reference: reference.trim() || null,
    });

    setConfirming(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setRecorded(data.recorded);
    setCart([]);
    setReference("");
    searchProducts(search);
  }

  return (
    <div className="flex flex-col gap-6" style={{ color: theme.textSecondary }}>
      {error && <p className="text-sm text-red-400">{error}</p>}

      {recorded && (
        <div
          className="rounded border p-3 text-sm"
          style={{ borderColor: "#0ca30c55", backgroundColor: "#0ca30c1a" }}
        >
          <p className="mb-1 font-semibold" style={{ color: "#4ade80" }}>
            Recorded:
          </p>
          <ul className="flex flex-col gap-0.5" style={{ color: "#4ade80" }}>
            {recorded.map((r, i) => (
              <li key={i}>
                {r.sku} {r.name}: {r.change > 0 ? `+${r.change}` : r.change} -{`>`} balance {r.balance}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Product search + results */}
        <div className="flex flex-col gap-3">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, SKU, brand..."
              className={`w-full ${inputClass}`}
              style={inputStyle}
            />
            <button
              type="submit"
              className="rounded border px-3 py-1.5 text-sm"
              style={{ borderColor: theme.border, color: theme.textSecondary }}
            >
              Search
            </button>
          </form>
          <div className="max-h-96 overflow-y-auto rounded border" style={{ borderColor: theme.border }}>
            <table className="w-full text-left text-sm">
              <thead style={{ backgroundColor: theme.cardBgAlt, color: theme.textMuted }}>
                <tr>
                  <th className="px-3 py-2 font-normal">SKU</th>
                  <th className="px-3 py-2 font-normal">Name</th>
                  <th className="px-3 py-2 text-right font-normal">Stock</th>
                  <th className="px-3 py-2 text-right font-normal">Reorder pt</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {results.map((p) => (
                  <tr key={p.product_id} className="border-t" style={{ borderColor: theme.border }}>
                    <td className="px-3 py-2 font-mono" style={{ color: theme.textPrimary }}>
                      {p.sku}
                    </td>
                    <td className="px-3 py-2">{p.name}</td>
                    <td className="px-3 py-2 text-right">{p.stock_on_hand}</td>
                    <td className="px-3 py-2 text-right">{p.reorder_point}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => addToCart(p)}
                        className="rounded px-2 py-1 text-xs font-medium"
                        style={{ backgroundColor: theme.accent, color: "#05230f" }}
                      >
                        Add
                      </button>
                    </td>
                  </tr>
                ))}
                {results.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center" style={{ color: theme.textMuted }}>
                      No products found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Batch */}
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold" style={{ color: theme.textPrimary }}>
            This batch (+ received, - correction)
          </h2>
          <div className="rounded border" style={{ borderColor: theme.border }}>
            <table className="w-full text-left text-sm">
              <thead style={{ backgroundColor: theme.cardBgAlt, color: theme.textMuted }}>
                <tr>
                  <th className="px-3 py-2 font-normal">SKU</th>
                  <th className="px-3 py-2 font-normal">Name</th>
                  <th className="px-3 py-2 text-right font-normal">Current</th>
                  <th className="px-3 py-2 text-right font-normal">Qty change</th>
                  <th className="px-3 py-2 text-right font-normal">New balance</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {cart.map((l) => (
                  <tr key={l.product_id} className="border-t" style={{ borderColor: theme.border }}>
                    <td className="px-3 py-2 font-mono" style={{ color: theme.textPrimary }}>
                      {l.sku}
                    </td>
                    <td className="px-3 py-2">{l.name}</td>
                    <td className="px-3 py-2 text-right">{l.stock_on_hand}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        value={l.qty}
                        onChange={(e) => setQty(l.product_id, e.target.value)}
                        className="w-20 rounded border px-1 py-0.5 text-right"
                        style={inputStyle}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">{l.stock_on_hand + l.qty}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => removeFromCart(l.product_id)} className="text-red-400 hover:underline">
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {cart.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-center" style={{ color: theme.textMuted }}>
                      No lines yet - add products from the left.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Reference (e.g. PO number, optional)"
            className={inputClass}
            style={inputStyle}
          />
          <button
            onClick={handleConfirm}
            disabled={cart.length === 0 || confirming}
            className="rounded px-4 py-2 text-sm font-medium disabled:opacity-40"
            style={{ backgroundColor: theme.accent, color: "#05230f" }}
          >
            {confirming ? "Recording..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
