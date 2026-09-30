"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

const emptyForm = {
  product_id: null,
  sku: "",
  name: "",
  category: "",
  brand: "",
  supplier: "",
  unit_cost: "",
  unit_price: "",
  reorder_point: "",
  opening_stock: "",
  is_active: true,
};

export default function ProductsScreen() {
  const supabase = createClient();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState(null); // null = form closed

  const loadProducts = useCallback(
    async (term) => {
      setLoading(true);
      setError("");
      const safeTerm = (term ?? "").replace(/[,()]/g, "");
      let query = supabase
        .from("products")
        .select(
          "product_id, sku, name, category, brand, supplier, unit_cost, unit_price, reorder_point, stock_on_hand, is_active"
        )
        .order("name")
        .limit(500);

      if (safeTerm) {
        query = query.or(
          `name.ilike.%${safeTerm}%,sku.ilike.%${safeTerm}%,brand.ilike.%${safeTerm}%,category.ilike.%${safeTerm}%`
        );
      }

      const { data, error: fetchError } = await query;
      if (fetchError) setError(fetchError.message);
      else setProducts(data ?? []);
      setLoading(false);
    },
    [supabase]
  );

  useEffect(() => {
    // Fetch-on-mount: setLoading/setError inside loadProducts run before
    // its first await, which is the standard pattern here (not a loop).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProducts("");
    supabase
      .from("products")
      .select("category")
      .then(({ data }) => {
        const unique = [...new Set((data ?? []).map((r) => r.category))].sort();
        setCategories(unique);
      });
  }, [loadProducts, supabase]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    loadProducts(search);
  }

  function openCreate() {
    setForm({ ...emptyForm });
    setNotice("");
  }

  function openEdit(p) {
    setForm({
      product_id: p.product_id,
      sku: p.sku,
      name: p.name,
      category: p.category,
      brand: p.brand,
      supplier: p.supplier,
      unit_cost: String(p.unit_cost),
      unit_price: String(p.unit_price),
      reorder_point: String(p.reorder_point),
      opening_stock: "", // not editable on existing products
      is_active: p.is_active,
    });
    setNotice("");
  }

  async function handleSave(e) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/products/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error || "Save failed.");
      return;
    }
    setForm(null);
    setNotice(form.product_id ? "Product updated." : "Product created.");
    loadProducts(search);
  }

  async function handleDelete(product_id) {
    if (!confirm("Remove this product?")) return;
    setError("");
    const res = await fetch("/api/products/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error || "Delete failed.");
      return;
    }
    setNotice(body.message);
    loadProducts(search);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, SKU, brand, category..."
            className="w-72 rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            type="submit"
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            Search
          </button>
        </form>
        <button
          onClick={openCreate}
          className="rounded bg-black px-4 py-1.5 text-sm text-white dark:bg-white dark:text-black"
        >
          + Add product
        </button>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {notice && <p className="text-sm text-green-700 dark:text-green-400">{notice}</p>}

      {form && (
        <ProductForm
          form={form}
          setForm={setForm}
          categories={categories}
          onSave={handleSave}
          onCancel={() => setForm(null)}
        />
      )}

      <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-100 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Brand</th>
              <th className="px-3 py-2 text-right">Cost</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">Stock</th>
              <th className="px-3 py-2 text-right">Reorder pt</th>
              <th className="px-3 py-2">Active</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="px-3 py-4 text-center text-zinc-500">
                  Loading...
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-4 text-center text-zinc-500">
                  No products found.
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={p.product_id} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="px-3 py-2 font-mono">{p.sku}</td>
                  <td className="px-3 py-2">{p.name}</td>
                  <td className="px-3 py-2">{p.category}</td>
                  <td className="px-3 py-2">{p.brand}</td>
                  <td className="px-3 py-2 text-right">{Number(p.unit_cost).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">{Number(p.unit_price).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">{p.stock_on_hand}</td>
                  <td className="px-3 py-2 text-right">{p.reorder_point}</td>
                  <td className="px-3 py-2">{p.is_active ? "yes" : "no"}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => openEdit(p)}
                      className="mr-2 text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(p.product_id)}
                      className="text-red-600 hover:underline dark:text-red-400"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductForm({ form, setForm, categories, onSave, onCancel }) {
  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  return (
    <form
      onSubmit={onSave}
      className="grid grid-cols-2 gap-3 rounded border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:grid-cols-4"
    >
      <Field label="SKU">
        <input
          required
          disabled={!!form.product_id}
          value={form.sku}
          onChange={(e) => set("sku", e.target.value)}
          className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 w-full"
        />
      </Field>
      <Field label="Name">
        <input required value={form.name} onChange={(e) => set("name", e.target.value)} className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 w-full" />
      </Field>
      <Field label="Category">
        <input
          list="category-options"
          value={form.category}
          onChange={(e) => set("category", e.target.value)}
          className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 w-full"
        />
        <datalist id="category-options">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <Field label="Brand">
        <input value={form.brand} onChange={(e) => set("brand", e.target.value)} className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 w-full" />
      </Field>
      <Field label="Supplier">
        <input value={form.supplier} onChange={(e) => set("supplier", e.target.value)} className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 w-full" />
      </Field>
      <Field label="Unit cost">
        <input
          type="number"
          step="0.01"
          value={form.unit_cost}
          onChange={(e) => set("unit_cost", e.target.value)}
          className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 w-full"
        />
      </Field>
      <Field label="Unit price">
        <input
          type="number"
          step="0.01"
          value={form.unit_price}
          onChange={(e) => set("unit_price", e.target.value)}
          className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 w-full"
        />
      </Field>
      <Field label="Reorder point">
        <input
          type="number"
          value={form.reorder_point}
          onChange={(e) => set("reorder_point", e.target.value)}
          className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 w-full"
        />
      </Field>
      {!form.product_id && (
        <Field label="Opening stock">
          <input
            type="number"
            value={form.opening_stock}
            onChange={(e) => set("opening_stock", e.target.value)}
            className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 w-full"
          />
        </Field>
      )}
      <Field label="Active">
        <input
          type="checkbox"
          checked={form.is_active}
          onChange={(e) => set("is_active", e.target.checked)}
        />
      </Field>

      <div className="col-span-full flex gap-2">
        <button type="submit" className="rounded bg-black px-4 py-1.5 text-sm text-white dark:bg-white dark:text-black">
          Save
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-zinc-300 px-4 py-1.5 text-sm dark:border-zinc-700">
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
      {label}
      {children}
    </label>
  );
}
