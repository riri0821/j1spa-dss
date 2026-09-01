"""One-time historical import (paper 3.2.1 - 3.2.3).

Reads the enterprise's legacy files from data/historical/:
    product_catalog.(csv|xlsx)   -> loaded into ops.products
    sales_records.(csv|xlsx)     -> loaded into dw.fact_transactions
                                    (source_type = 'Historical Migration')

Runs the full cleanse: extract -> DCR -> transform (dedupe, null handling,
name/date standardization, price/cost backfill from catalog) -> DRR ->
load -> LSR. Writes one ops.etl_runs row with the three metrics.
"""
from __future__ import annotations
from pathlib import Path
import pandas as pd
from sqlalchemy import text

from config import config
from ..db import ops_engine, dw_engine
from .common import (
    std_text, norm_key, parse_date, ensure_date_key, source_key,
    upsert_dim_product, data_completeness_rate, duplicate_reduction_rate,
    load_success_rate, CRITICAL_SALE_FIELDS,
)

CATALOG_COLS = {
    "sku": ["sku", "item_code", "code", "product_code"],
    "name": ["name", "description", "item_name", "product_name"],
    "category": ["category", "cat", "group"],
    "brand": ["brand", "make"],
    "supplier": ["supplier", "vendor"],
    "vehicle_compat": ["vehicle_compat", "compatibility", "fitment"],
    "unit_cost": ["unit_cost", "cost", "buy_price"],
    "unit_price": ["unit_price", "price", "srp", "sell_price"],
    "reorder_point": ["reorder_point", "rop", "min_stock"],
    "opening_stock": ["opening_stock", "on_hand", "stock", "qty_on_hand"],
}
SALES_COLS = {
    "txn_date": ["date", "txn_date", "sale_date", "transaction_date"],
    "sku": ["sku", "item_code", "code", "product_code"],
    "quantity": ["quantity", "qty", "units", "qty_sold"],
    "unit_price": ["unit_price", "price", "sell_price"],
    "unit_cost": ["unit_cost", "cost"],
}


def _find_file(stem: str) -> Path | None:
    for ext in (".csv", ".xlsx", ".xls"):
        p = config.HISTORICAL_DIR / f"{stem}{ext}"
        if p.exists():
            return p
    return None


def _read_any(path: Path) -> pd.DataFrame:
    if path.suffix.lower() == ".csv":
        return pd.read_csv(path, dtype=str, keep_default_na=True)
    return pd.read_excel(path, dtype=str)


def _map_columns(df: pd.DataFrame, mapping: dict) -> pd.DataFrame:
    lower = {c.lower().strip(): c for c in df.columns}
    out = pd.DataFrame(index=df.index)
    for target, aliases in mapping.items():
        src = next((lower[a] for a in aliases if a in lower), None)
        out[target] = df[src] if src else pd.NA
    return out


def run(trigger_source: str = "deployment") -> dict:
    catalog_path = _find_file("product_catalog")
    sales_path = _find_file("sales_records")
    if not catalog_path or not sales_path:
        raise FileNotFoundError(
            f"Place product_catalog and sales_records files in {config.HISTORICAL_DIR}"
        )

    with ops_engine.begin() as oc:
        run_id = oc.execute(text("""
            INSERT INTO etl_runs (run_type, trigger_source, status)
            VALUES ('historical_import', :ts, 'running')
        """), {"ts": trigger_source}).lastrowid

    try:
        # ---------------- EXTRACT ----------------
        raw_catalog = _map_columns(_read_any(catalog_path), CATALOG_COLS)
        raw_sales = _map_columns(_read_any(sales_path), SALES_COLS)
        rows_read = len(raw_catalog) + len(raw_sales)

        # ---------------- DCR (baseline quality of legacy data) ----------------
        sales_for_dcr = raw_sales.copy()
        sales_for_dcr["txn_date"] = sales_for_dcr["txn_date"].map(parse_date)
        dcr = data_completeness_rate(sales_for_dcr, CRITICAL_SALE_FIELDS)

        # ---------------- TRANSFORM: catalog ----------------
        cat = raw_catalog.copy()
        cat["sku"] = cat["sku"].map(lambda v: std_text(v).upper())
        cat["name"] = cat["name"].map(std_text)
        for col in ("category", "brand", "supplier", "vehicle_compat"):
            cat[col] = cat[col].map(std_text)
        for col in ("unit_cost", "unit_price"):
            cat[col] = pd.to_numeric(cat[col], errors="coerce").fillna(0.0)
        for col in ("reorder_point", "opening_stock"):
            cat[col] = pd.to_numeric(cat[col], errors="coerce").fillna(0).astype(int)
        cat = cat[cat["sku"].str.len() > 0]
        raw_cat_count = len(cat)
        cat = cat.drop_duplicates(subset=["sku"], keep="last")
        catalog_lookup = cat.set_index("sku").to_dict("index")

        # ---------------- TRANSFORM: sales ----------------
        s = raw_sales.copy()
        s["sku"] = s["sku"].map(lambda v: std_text(v).upper())
        s["txn_date"] = s["txn_date"].map(parse_date)
        s["quantity"] = pd.to_numeric(s["quantity"], errors="coerce")
        s["unit_price"] = pd.to_numeric(s["unit_price"], errors="coerce")
        s["unit_cost"] = pd.to_numeric(s["unit_cost"], errors="coerce")

        # backfill price / cost from the catalog by SKU
        s["unit_price"] = s.apply(
            lambda r: r["unit_price"] if pd.notna(r["unit_price"])
            else catalog_lookup.get(r["sku"], {}).get("unit_price", 0.0), axis=1)
        s["unit_cost"] = s.apply(
            lambda r: r["unit_cost"] if pd.notna(r["unit_cost"])
            else catalog_lookup.get(r["sku"], {}).get("unit_cost", 0.0), axis=1)

        # rows with no date or non-positive quantity go to an audit set, not the time series
        audit = s[s["txn_date"].isna() | s["quantity"].isna() | (s["quantity"] <= 0)]
        clean = s.drop(audit.index)
        clean = clean[clean["sku"].isin(catalog_lookup.keys())]

        raw_sales_count = len(s)
        clean = clean.drop_duplicates(
            subset=["txn_date", "sku", "quantity", "unit_price"], keep="first")
        drr = duplicate_reduction_rate(raw_sales_count, len(clean) + len(audit))
        transformed = len(clean)

        # ---------------- LOAD: catalog -> ops.products ----------------
        loaded_products = 0
        with ops_engine.begin() as oc:
            for sku, rec in catalog_lookup.items():
                oc.execute(text("""
                    INSERT INTO products (sku, name, category, brand, supplier,
                        vehicle_compat, unit_cost, unit_price, reorder_point,
                        stock_on_hand, source_type)
                    VALUES (:sku,:name,:cat,:brand,:sup,:vc,:uc,:up,:rop,:stock,
                            'Historical Migration')
                    ON DUPLICATE KEY UPDATE
                        name=VALUES(name), category=VALUES(category), brand=VALUES(brand),
                        supplier=VALUES(supplier), vehicle_compat=VALUES(vehicle_compat),
                        unit_cost=VALUES(unit_cost), unit_price=VALUES(unit_price),
                        reorder_point=VALUES(reorder_point)
                """), {
                    "sku": sku, "name": rec["name"] or sku,
                    "cat": rec["category"] or "Uncategorized",
                    "brand": rec["brand"] or "Generic",
                    "sup": rec["supplier"] or "Unknown",
                    "vc": rec["vehicle_compat"] or None,
                    "uc": rec["unit_cost"], "up": rec["unit_price"],
                    "rop": int(rec["reorder_point"]),
                    "stock": int(rec["opening_stock"]),
                })
                loaded_products += 1

        # ops.product_id lookup for the fact load
        with ops_engine.begin() as oc:
            pid_map = {r[0]: r[1] for r in oc.execute(text(
                "SELECT sku, product_id FROM products")).all()}

        # ---------------- LOAD: sales -> dw.fact_transactions ----------------
        loaded_facts = 0
        with dw_engine.begin() as dc:
            src_key = source_key(dc, "Historical Migration")
            pkey_cache: dict[str, int] = {}
            # synthetic negative sale_item_id space for historical rows so the
            # UNIQUE(sale_item_id) upsert never collides with live ops ids
            for i, (_, r) in enumerate(clean.iterrows(), start=1):
                sku = r["sku"]
                cat_rec = catalog_lookup[sku]
                pkey = pkey_cache.get(sku)
                if pkey is None:
                    pkey = upsert_dim_product(dc, {
                        "product_id": pid_map.get(sku, 0), "sku": sku,
                        "name": cat_rec["name"] or sku,
                        "category": cat_rec["category"], "brand": cat_rec["brand"],
                        "supplier": cat_rec["supplier"],
                        "unit_cost": cat_rec["unit_cost"],
                        "unit_price": cat_rec["unit_price"],
                        "reorder_point": int(cat_rec["reorder_point"]),
                    })
                    pkey_cache[sku] = pkey
                dk = ensure_date_key(dc, r["txn_date"])
                qty = int(r["quantity"])
                rev = round(qty * float(r["unit_price"]), 2)
                cost = round(qty * float(r["unit_cost"]), 2)
                dc.execute(text("""
                    INSERT INTO fact_transactions (date_key, product_key, source_key,
                        sale_id, sale_item_id, quantity, revenue, cost, gross_profit)
                    VALUES (:dk,:pk,:sk,:sid,:siid,:q,:rev,:cost,:gp)
                    ON DUPLICATE KEY UPDATE date_key=VALUES(date_key),
                        product_key=VALUES(product_key), sale_id=VALUES(sale_id),
                        quantity=VALUES(quantity), revenue=VALUES(revenue),
                        cost=VALUES(cost), gross_profit=VALUES(gross_profit)
                """), {
                    "dk": dk, "pk": pkey, "sk": src_key,
                    # each legacy row is treated as its own transaction
                    "sid": -i, "siid": -i,
                    "q": qty, "rev": rev, "cost": cost, "gp": round(rev - cost, 2),
                })
                loaded_facts += 1

        lsr = load_success_rate(transformed, loaded_facts)
        msg = (f"catalog rows: {raw_cat_count} -> {loaded_products} products; "
               f"sales rows: {raw_sales_count} raw, {len(audit)} audited, "
               f"{loaded_facts} loaded to fact_transactions.")

        with ops_engine.begin() as oc:
            oc.execute(text("""
                UPDATE etl_runs SET finished_ts=NOW(), status='success',
                    rows_read=:rr, rows_loaded=:rl, dcr=:dcr, drr=:drr, lsr=:lsr,
                    message=:msg
                WHERE run_id=:id
            """), {"rr": rows_read, "rl": loaded_products + loaded_facts,
                   "dcr": dcr, "drr": drr, "lsr": lsr, "msg": msg, "id": run_id})

        return {"run_id": run_id, "dcr": dcr, "drr": drr, "lsr": lsr,
                "products": loaded_products, "facts": loaded_facts,
                "audited": len(audit), "message": msg}

    except Exception as exc:  # noqa: BLE001
        with ops_engine.begin() as oc:
            oc.execute(text("""
                UPDATE etl_runs SET finished_ts=NOW(), status='failed', message=:m
                WHERE run_id=:id
            """), {"m": f"{type(exc).__name__}: {exc}", "id": run_id})
        raise
