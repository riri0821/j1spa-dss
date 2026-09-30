"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { theme, CATEGORICAL } from "../dashboard/theme";

const inputClass = "rounded border px-3 py-1.5 text-sm";
const inputStyle = { backgroundColor: theme.cardBgAlt, borderColor: theme.border, color: theme.textPrimary };
const PAGE_SIZE = 20;

export default function SalesScreen({ userId, role }) {
  const supabase = createClient();

  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [cart, setCart] = useState([]); // [{product_id, sku, name, unit_price, stock_on_hand, qty}]
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [recentSales, setRecentSales] = useState([]);
  const [salesPage, setSalesPage] = useState(1);
  const [expanded, setExpanded] = useState(null); // sale_id currently expanded
  const [saleItemsCache, setSaleItemsCache] = useState({});

  const searchProducts = useCallback(
    async (term) => {
      const safeTerm = term.replace(/[,()]/g, "");
      let query = supabase
        .from("products")
        .select("product_id, sku, name, category, brand, unit_price, stock_on_hand")
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

  const loadRecentSales = useCallback(async () => {
    const { data: sales } = await supabase
      .from("sales")
      .select("sale_id, sale_ts, total_amount, note, user_id, profiles(full_name)")
      .eq("status", "confirmed")
      .order("sale_id", { ascending: false })
      .limit(200);

    const list = sales ?? [];
    if (list.length === 0) {
      setRecentSales([]);
      return;
    }

    const { data: items } = await supabase
      .from("sale_items")
      .select("sale_id")
      .in("sale_id", list.map((s) => s.sale_id));

    const lineCounts = {};
    (items ?? []).forEach((it) => {
      lineCounts[it.sale_id] = (lineCounts[it.sale_id] ?? 0) + 1;
    });

    const today = new Date().toDateString();
    setRecentSales(
      list.map((s) => ({
        ...s,
        lines: lineCounts[s.sale_id] ?? 0,
        can_undo: role === "owner" || (s.user_id === userId && new Date(s.sale_ts).toDateString() === today),
      }))
    );
  }, [supabase, role, userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    searchProducts("");
    loadRecentSales();
  }, [searchProducts, loadRecentSales]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    searchProducts(search);
  }

  const totalSalesPages = Math.max(1, Math.ceil(recentSales.length / PAGE_SIZE));
  const currentSalesPage = Math.min(salesPage, totalSalesPages);
  const paginatedSales = recentSales.slice((currentSalesPage - 1) * PAGE_SIZE, currentSalesPage * PAGE_SIZE);
  const salesRangeStart = recentSales.length === 0 ? 0 : (currentSalesPage - 1) * PAGE_SIZE + 1;
  const salesRangeEnd = Math.min(currentSalesPage * PAGE_SIZE, recentSales.length);

  function addToCart(p) {
    setCart((prev) => {
      const existing = prev.find((line) => line.product_id === p.product_id);
      if (existing) {
        return prev.map((line) =>
          line.product_id === p.product_id ? { ...line, qty: line.qty + 1 } : line
        );
      }
      return [...prev, { ...p, qty: 1 }];
    });
  }

  function setQty(product_id, qty) {
    const n = Math.max(1, Number(qty) || 1);
    setCart((prev) => prev.map((l) => (l.product_id === product_id ? { ...l, qty: n } : l)));
  }

  function removeFromCart(product_id) {
    setCart((prev) => prev.filter((l) => l.product_id !== product_id));
  }

  const cartTotal = cart.reduce((sum, l) => sum + l.qty * Number(l.unit_price), 0);

  async function handleConfirm() {
    if (cart.length === 0) return;
    setError("");
    setNotice("");
    setConfirming(true);

    const { data, error: rpcError } = await supabase.rpc("confirm_sale", {
      items: cart.map((l) => ({ product_id: l.product_id, qty: l.qty })),
      note: note.trim() || null,
    });

    setConfirming(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setNotice(`Sale #${data.sale_id} recorded - total ${Number(data.total_amount).toFixed(2)}.`);
    setCart([]);
    setNote("");
    searchProducts(search); // refresh stock_on_hand shown in results
    loadRecentSales();
  }

  async function handleUndo(saleId) {
    if (!confirm(`Undo sale #${saleId}? Stock will be restored.`)) return;
    setError("");
    const { error: rpcError } = await supabase.rpc("undo_sale", { p_sale_id: saleId });
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setNotice(`Sale #${saleId} undone.`);
    searchProducts(search);
    loadRecentSales();
  }

  async function toggleDetails(saleId) {
    if (expanded === saleId) {
      setExpanded(null);
      return;
    }
    setExpanded(saleId);
    if (!saleItemsCache[saleId]) {
      const { data } = await supabase
        .from("sale_items")
        .select("sku, quantity, unit_price, line_revenue, products(name)")
        .eq("sale_id", saleId);
      setSaleItemsCache((prev) => ({ ...prev, [saleId]: data ?? [] }));
    }
  }

  return (
    <div className="flex flex-col gap-6" style={{ color: theme.textSecondary }}>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {notice && <p className="text-sm text-green-400">{notice}</p>}

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
                  <th className="px-3 py-2 text-right font-normal">Price</th>
                  <th className="px-3 py-2 text-right font-normal">Stock</th>
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
                    <td className="px-3 py-2 text-right">{Number(p.unit_price).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">{p.stock_on_hand}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => addToCart(p)}
                        disabled={p.stock_on_hand <= 0}
                        className="rounded px-2 py-1 text-xs font-medium disabled:opacity-40"
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

        {/* Cart */}
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold" style={{ color: theme.textPrimary }}>
            Current sale
          </h2>
          <div className="rounded border" style={{ borderColor: theme.border }}>
            <table className="w-full text-left text-sm">
              <thead style={{ backgroundColor: theme.cardBgAlt, color: theme.textMuted }}>
                <tr>
                  <th className="px-3 py-2 font-normal">SKU</th>
                  <th className="px-3 py-2 font-normal">Name</th>
                  <th className="px-3 py-2 text-right font-normal">Qty</th>
                  <th className="px-3 py-2 text-right font-normal">Line total</th>
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
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={1}
                        value={l.qty}
                        onChange={(e) => setQty(l.product_id, e.target.value)}
                        className="w-16 rounded border px-1 py-0.5 text-right"
                        style={inputStyle}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">{(l.qty * Number(l.unit_price)).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => removeFromCart(l.product_id)} className="text-red-400 hover:underline">
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {cart.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center" style={{ color: theme.textMuted }}>
                      No items yet - add products from the left.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-sm font-semibold" style={{ color: theme.textPrimary }}>
            <span>Total</span>
            <span>{cartTotal.toFixed(2)}</span>
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className={inputClass}
            style={inputStyle}
          />
          <button
            onClick={handleConfirm}
            disabled={cart.length === 0 || confirming}
            className="rounded px-4 py-2 text-sm font-medium disabled:opacity-40"
            style={{ backgroundColor: theme.accent, color: "#05230f" }}
          >
            {confirming ? "Recording..." : "Confirm sale"}
          </button>
        </div>
      </div>

      {/* Recent sales */}
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold" style={{ color: theme.textPrimary }}>
          Recent sales
        </h2>
        <div className="overflow-x-auto rounded border" style={{ borderColor: theme.border }}>
          <table className="w-full text-left text-sm">
            <thead style={{ backgroundColor: theme.cardBgAlt, color: theme.textMuted }}>
              <tr>
                <th className="px-3 py-2 font-normal">Sale</th>
                <th className="px-3 py-2 font-normal">Time</th>
                <th className="px-3 py-2 font-normal">Cashier</th>
                <th className="px-3 py-2 text-right font-normal">Lines</th>
                <th className="px-3 py-2 text-right font-normal">Total</th>
                <th className="px-3 py-2 font-normal">Note</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {paginatedSales.map((s) => (
                <Fragment key={s.sale_id}>
                  <tr className="border-t" style={{ borderColor: theme.border }}>
                    <td className="px-3 py-2">
                      <button onClick={() => toggleDetails(s.sale_id)} style={{ color: CATEGORICAL[0] }} className="hover:underline">
                        #{s.sale_id}
                      </button>
                    </td>
                    <td className="px-3 py-2">{new Date(s.sale_ts).toLocaleString()}</td>
                    <td className="px-3 py-2">{s.profiles?.full_name ?? "Former staff"}</td>
                    <td className="px-3 py-2 text-right">{s.lines}</td>
                    <td className="px-3 py-2 text-right">{Number(s.total_amount).toFixed(2)}</td>
                    <td className="px-3 py-2">{s.note}</td>
                    <td className="px-3 py-2 text-right">
                      {s.can_undo && (
                        <button onClick={() => handleUndo(s.sale_id)} className="text-red-400 hover:underline">
                          Undo
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded === s.sale_id && (
                    <tr className="border-t" style={{ borderColor: theme.border, backgroundColor: theme.cardBgAlt }}>
                      <td colSpan={7} className="px-3 py-2">
                        <table className="w-full text-xs">
                          <thead>
                            <tr style={{ color: theme.textMuted }}>
                              <th className="px-2 py-1 text-left font-normal">SKU</th>
                              <th className="px-2 py-1 text-left font-normal">Name</th>
                              <th className="px-2 py-1 text-right font-normal">Qty</th>
                              <th className="px-2 py-1 text-right font-normal">Unit price</th>
                              <th className="px-2 py-1 text-right font-normal">Line total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(saleItemsCache[s.sale_id] ?? []).map((it, i) => (
                              <tr key={i}>
                                <td className="px-2 py-1 font-mono">{it.sku}</td>
                                <td className="px-2 py-1">{it.products?.name}</td>
                                <td className="px-2 py-1 text-right">{it.quantity}</td>
                                <td className="px-2 py-1 text-right">{Number(it.unit_price).toFixed(2)}</td>
                                <td className="px-2 py-1 text-right">{Number(it.line_revenue).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {recentSales.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center" style={{ color: theme.textMuted }}>
                    No sales recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {recentSales.length > 0 && (
          <div className="flex items-center justify-between text-xs" style={{ color: theme.textMuted }}>
            <span>
              Showing {salesRangeStart}-{salesRangeEnd} of {recentSales.length}
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSalesPage(Math.max(1, currentSalesPage - 1))}
                disabled={currentSalesPage === 1}
                className="rounded border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ borderColor: theme.border, color: theme.textSecondary }}
              >
                Prev
              </button>
              <span>
                Page {currentSalesPage} of {totalSalesPages}
              </span>
              <button
                onClick={() => setSalesPage(Math.min(totalSalesPages, currentSalesPage + 1))}
                disabled={currentSalesPage === totalSalesPages}
                className="rounded border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ borderColor: theme.border, color: theme.textSecondary }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
