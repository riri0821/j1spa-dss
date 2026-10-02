"""Built-in analytics dashboard (owner only). Tier 1 descriptive + Tier 2
diagnostic summaries read from the warehouse, the product-velocity
classification table, and the on-demand ETL "Refresh" control
(paper 3.10.2 / manual-refresh addendum)."""
from flask import Blueprint, render_template, jsonify
from flask_login import login_required
from sqlalchemy import text

from .db import dw_conn, ops_conn, q
from .security import owner_only

bp = Blueprint("analytics", __name__, url_prefix="/analytics")


@bp.route("/dashboard")
@bp.route("/")
@login_required
@owner_only
def dashboard():
    return render_template("dashboard.html")


@bp.route("/api/kpis")
@login_required
@owner_only
def api_kpis():
    """Header KPIs for the built-in executive dashboard (paper 3.10.2):
    gross profit margin (+ period delta), today's gross profit (+ delta vs
    yesterday), active SKUs, plus the historical window and last ETL sync
    shown in the header. "Today" reflects data as of the last ETL sync, not
    live - the dashboard reads the warehouse, not the operational DB."""
    with dw_conn() as d:
        cur = q(d, """
            SELECT COALESCE(SUM(revenue),0)      AS revenue,
                   COALESCE(SUM(gross_profit),0) AS gross_profit
            FROM fact_transactions f JOIN dim_date d ON d.date_key = f.date_key
            WHERE d.full_date >= (CURDATE() - INTERVAL 90 DAY)
        """)[0]
        prev = q(d, """
            SELECT COALESCE(SUM(revenue),0) AS revenue,
                   COALESCE(SUM(gross_profit),0) AS gross_profit
            FROM fact_transactions f JOIN dim_date d ON d.date_key = f.date_key
            WHERE d.full_date >= (CURDATE() - INTERVAL 180 DAY)
              AND d.full_date <  (CURDATE() - INTERVAL 90 DAY)
        """)[0]
        span = q(d, """SELECT MIN(d.year) AS y0, MAX(d.year) AS y1
                       FROM dim_date d JOIN fact_transactions f
                            ON f.date_key = d.date_key""")[0]
        today = q(d, """
            SELECT COALESCE(SUM(gross_profit),0) AS gross_profit
            FROM fact_transactions f JOIN dim_date d ON d.date_key = f.date_key
            WHERE d.full_date = CURDATE()
        """)[0]
        yesterday = q(d, """
            SELECT COALESCE(SUM(gross_profit),0) AS gross_profit
            FROM fact_transactions f JOIN dim_date d ON d.date_key = f.date_key
            WHERE d.full_date = (CURDATE() - INTERVAL 1 DAY)
        """)[0]

    with ops_conn() as c:
        sku_count = q(c, "SELECT COUNT(*) AS n FROM products WHERE is_active = 1")[0]["n"]
        ls = q(c, """SELECT finished_ts FROM etl_runs
                     WHERE status='success' ORDER BY run_id DESC LIMIT 1""")
    last_sync = (ls[0]["finished_ts"].strftime("%b %d, %Y %H:%M")
                 if ls and ls[0]["finished_ts"] else "not yet run")

    rev, gp = float(cur["revenue"]), float(cur["gross_profit"])
    gpm = round(gp / rev * 100, 2) if rev else 0.0
    prev_rev, prev_gp = float(prev["revenue"]), float(prev["gross_profit"])
    prev_gpm = (prev_gp / prev_rev * 100) if prev_rev else 0.0

    today_profit = float(today["gross_profit"])
    yesterday_profit = float(yesterday["gross_profit"])
    # only show a delta once today has *some* recorded profit - a bare 0 most
    # likely means no sales have synced yet today (early in the day, or the
    # ETL hasn't run), not an actual 100% crash, so don't flag it as one.
    # Divide by abs(yesterday) so the sign always reflects better/worse, not
    # an artifact of yesterday's profit being negative (a refund-heavy day).
    today_profit_delta_pct = (round((today_profit - yesterday_profit) / abs(yesterday_profit) * 100, 1)
                              if yesterday_profit and today_profit else None)

    return jsonify({
        "window": "trailing 90 days",
        "gross_profit_margin_pct": gpm,
        "gross_profit_margin_delta_pct": round(gpm - prev_gpm, 1),
        "today_profit": round(today_profit, 2),
        "today_profit_delta_pct": today_profit_delta_pct,
        "sku_count": sku_count,
        "last_sync": last_sync,
        "historical_window": (f"approximately {span['y0']} to {span['y1']}"
                              if span and span["y0"] else "no history yet"),
    })


@bp.route("/api/velocity-table")
@login_required
@owner_only
def api_velocity_table():
    """Prototype dashboard table: SKU, item, movement class, current stock,
    reorder point, and a Low stock / Stable / Overstocked status."""
    with ops_conn() as c:
        prods = q(c, """SELECT product_id, sku, name, category, stock_on_hand,
                               reorder_point
                        FROM products WHERE is_active = 1""")
    with dw_conn() as d:
        vel = {r["sku"]: float(r["units_90d"]) for r in q(d, """
            SELECT sku, units_90d FROM vw_product_velocity""")}

    units = sorted((vel.get(p["sku"], 0.0) for p in prods), reverse=True)
    # top 40% by trailing-90d units are "Fast-Moving"
    cutoff = units[int(len(units) * 0.4)] if units else 0.0
    rows = []
    for p in prods:
        u = vel.get(p["sku"], 0.0)
        movement = ("No recent sales" if u == 0 else
                    "Fast-Moving" if u >= max(cutoff, 1) else "Slow-Moving")
        soh, rop = p["stock_on_hand"], p["reorder_point"]
        if soh <= rop:
            status, sev = "Low stock", 0
        elif rop > 0 and soh > 3 * rop:
            status, sev = "Overstocked", 1
        else:
            status, sev = "Stable", 2
        rows.append({"sku": p["sku"], "name": p["name"], "category": p["category"],
                     "movement": movement, "stock_on_hand": soh, "reorder_point": rop,
                     "status": status, "units_90d": round(u), "_sev": sev, "_u": u})
    rows.sort(key=lambda r: (r["_sev"], -r["_u"]))
    for r in rows:
        r.pop("_sev"); r.pop("_u")
    return jsonify(rows)


@bp.route("/api/sales-heatmap")
@login_required
@owner_only
def api_sales_heatmap():
    """Units sold per (year, month) across the full sales history, for the
    dashboard's calendar-heatmap tile (replaces a 6-month-only line chart
    with the whole trend at a glance)."""
    with dw_conn() as d:
        span = q(d, """SELECT MIN(dd.full_date) AS mn, MAX(dd.full_date) AS mx
                       FROM dim_date dd JOIN fact_transactions f
                            ON f.date_key = dd.date_key""")[0]
        if not span["mn"]:
            return jsonify({"years": [], "cells": []})
        rows = q(d, """
            SELECT dd.year, dd.month, MIN(dd.month_name) AS month_name,
                   COALESCE(SUM(f.quantity),0) AS units
            FROM dim_date dd
            LEFT JOIN fact_transactions f ON f.date_key = dd.date_key
            WHERE dd.full_date BETWEEN :mn AND :mx
            GROUP BY dd.year, dd.month
            ORDER BY dd.year, dd.month
        """, mn=span["mn"], mx=span["mx"])
    years = sorted({r["year"] for r in rows})
    return jsonify({
        "years": years,
        "cells": [{"year": r["year"], "month": r["month"], "month_name": r["month_name"][:3],
                   "units": int(r["units"])} for r in rows],
    })


@bp.route("/api/etl-status")
@login_required
@owner_only
def api_etl_status():
    with ops_conn() as c:
        runs = q(c, """
            SELECT run_id, run_type, trigger_source, started_ts, finished_ts,
                   status, rows_read, rows_loaded, dcr, drr, lsr, message
            FROM etl_runs ORDER BY run_id DESC LIMIT 15
        """)
    for r in runs:
        r["started_ts"] = r["started_ts"].strftime("%Y-%m-%d %H:%M:%S")
        r["finished_ts"] = r["finished_ts"].strftime("%Y-%m-%d %H:%M:%S") if r["finished_ts"] else None
        for k in ("dcr", "drr", "lsr"):
            r[k] = float(r[k]) if r[k] is not None else None
    return jsonify(runs)


@bp.route("/refresh", methods=["POST"])
@login_required
@owner_only
def refresh():
    """Manual on-demand incremental sync (the dashboard 'Refresh' control)."""
    from .etl import incremental
    res = incremental.run(trigger_source="manual")
    return jsonify(ok=True, **res)
