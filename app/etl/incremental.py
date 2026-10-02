"""Incremental sync (paper 3.2.4).

Runs on a schedule AND on demand from the dashboard's "Refresh" control.
Reads rows the direct sales entry interface has written since the last run
(sales/sale_items/stock_movements with synced_dw = 0), validates + key-maps
them, and appends/updates them in the warehouse. Idempotent: keyed on
sale_item_id / movement_id, so re-runs are safe. Direct Sales Entry itself has
no void/cancel path, but the schema still allows sales.status = 'voided' (e.g.
a restored backup or a manual correction), so voided rows are still excluded
here rather than loaded into the warehouse as revenue.
"""
from __future__ import annotations
from sqlalchemy import text, bindparam

from ..db import ops_engine, dw_engine
from .common import ensure_date_key, source_key, upsert_dim_product, load_success_rate

_ITEMS_SQL = text("""
    SELECT si.sale_item_id, si.sale_id, si.product_id, si.sku, si.quantity,
           si.unit_price, si.unit_cost, si.line_revenue, si.line_cost,
           s.sale_ts, s.status
    FROM sale_items si JOIN sales s ON s.sale_id = si.sale_id
    WHERE si.sale_id IN :ids
""").bindparams(bindparam("ids", expanding=True))

_MARK_SALES_SQL = text(
    "UPDATE sales SET synced_dw = 1 WHERE sale_id IN :ids"
).bindparams(bindparam("ids", expanding=True))


def run(trigger_source: str = "scheduled") -> dict:
    with ops_engine.begin() as oc:
        run_id = oc.execute(text("""
            INSERT INTO etl_runs (run_type, trigger_source, status)
            VALUES ('incremental', :ts, 'running')
        """), {"ts": trigger_source}).lastrowid

    try:
        with ops_engine.begin() as oc:
            sale_ids = [r[0] for r in oc.execute(
                text("SELECT sale_id FROM sales WHERE synced_dw = 0")).all()]
            items = oc.execute(_ITEMS_SQL, {"ids": sale_ids}).all() if sale_ids else []
            products = {r[0]: r for r in oc.execute(text("""
                SELECT product_id, sku, name, category, brand, supplier,
                       unit_cost, unit_price, reorder_point FROM products
            """)).all()}
            pending_moves = oc.execute(text("""
                SELECT movement_id, movement_ts, product_id, sku, movement_type,
                       quantity, balance_after
                FROM stock_movements WHERE synced_dw = 0
            """)).all()

        rows_read = len(items) + len(pending_moves)
        loaded = 0

        with dw_engine.begin() as dc:
            src_live = source_key(dc, "Direct Sales Entry")
            pkey_cache: dict[int, int] = {}

            def pkey_for(product_id: int):
                if product_id in pkey_cache:
                    return pkey_cache[product_id]
                p = products.get(product_id)
                if not p:
                    return None
                k = upsert_dim_product(dc, {
                    "product_id": p[0], "sku": p[1], "name": p[2], "category": p[3],
                    "brand": p[4], "supplier": p[5], "unit_cost": float(p[6]),
                    "unit_price": float(p[7]), "reorder_point": int(p[8]),
                })
                pkey_cache[product_id] = k
                return k

            for it in items:
                (siid, sid, pid, sku, qty, up, uc, lrev, lcost, sts, status) = it
                if status == "voided":
                    dc.execute(text("DELETE FROM fact_transactions WHERE sale_item_id = :s"),
                               {"s": siid})
                    continue
                pk = pkey_for(pid)
                if pk is None:
                    continue
                dk = ensure_date_key(dc, sts.date())
                rev, cost = float(lrev), float(lcost)
                dc.execute(text("""
                    INSERT INTO fact_transactions (date_key, product_key, source_key,
                        sale_id, sale_item_id, quantity, revenue, cost, gross_profit)
                    VALUES (:dk,:pk,:sk,:sid,:siid,:q,:rev,:cost,:gp)
                    ON DUPLICATE KEY UPDATE date_key=VALUES(date_key),
                        product_key=VALUES(product_key), quantity=VALUES(quantity),
                        revenue=VALUES(revenue), cost=VALUES(cost),
                        gross_profit=VALUES(gross_profit)
                """), {"dk": dk, "pk": pk, "sk": src_live, "sid": sid, "siid": siid,
                       "q": int(qty), "rev": rev, "cost": cost,
                       "gp": round(rev - cost, 2)})
                loaded += 1

            for mv in pending_moves:
                (mid, mts, pid, sku, mtype, qty, bal) = mv
                pk = pkey_for(pid)
                if pk is None:
                    continue
                dk = ensure_date_key(dc, mts.date())
                dc.execute(text("""
                    INSERT INTO fact_stock_movement (date_key, product_key, source_key,
                        movement_id, movement_type, quantity, balance_after)
                    VALUES (:dk,:pk,:sk,:mid,:mt,:q,:bal)
                    ON DUPLICATE KEY UPDATE quantity=VALUES(quantity),
                        balance_after=VALUES(balance_after)
                """), {"dk": dk, "pk": pk, "sk": src_live, "mid": mid,
                       "mt": mtype, "q": int(qty), "bal": int(bal)})
                loaded += 1

        with ops_engine.begin() as oc:
            if sale_ids:
                oc.execute(_MARK_SALES_SQL, {"ids": sale_ids})
            oc.execute(text("UPDATE stock_movements SET synced_dw = 1 WHERE synced_dw = 0"))

        lsr = load_success_rate(rows_read, loaded)
        msg = f"{len(items)} sale lines + {len(pending_moves)} movements synced."
        with ops_engine.begin() as oc:
            oc.execute(text("""
                UPDATE etl_runs SET finished_ts=NOW(), status='success', rows_read=:rr,
                    rows_loaded=:rl, dcr=100.00, drr=0.00, lsr=:lsr, message=:m
                WHERE run_id=:id
            """), {"rr": rows_read, "rl": loaded, "lsr": lsr, "m": msg, "id": run_id})
        return {"run_id": run_id, "rows_read": rows_read, "rows_loaded": loaded,
                "lsr": lsr, "message": msg}

    except Exception as exc:  # noqa: BLE001
        with ops_engine.begin() as oc:
            oc.execute(text("""
                UPDATE etl_runs SET finished_ts=NOW(), status='failed', message=:m
                WHERE run_id=:id
            """), {"m": f"{type(exc).__name__}: {exc}", "id": run_id})
        raise
