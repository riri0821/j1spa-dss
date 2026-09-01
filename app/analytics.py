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
    gross profit margin (+ period delta), average transaction value, active
    SKUs, plus the historical window and last ETL sync shown in the header."""
    with dw_conn() as d:
        cur = q(d, """
            SELECT COALESCE(SUM(revenue),0)      AS revenue,
                   COALESCE(SUM(gross_profit),0) AS gross_profit,
                   COUNT(DISTINCT sale_id)       AS transactions
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
        sku_count = q(d, "SELECT COUNT(*) AS n FROM dim_product")[0]["n"]

    with ops_conn() as c:
        ls = q(c, """SELECT finished_ts FROM etl_runs
                     WHERE status='success' ORDER BY run_id DESC LIMIT 1""")
    last_sync = (ls[0]["finished_ts"].strftime("%b %d, %Y %H:%M")
                 if ls and ls[0]["finished_ts"] else "not yet run")

    rev, gp = float(cur["revenue"]), float(cur["gross_profit"])
    txns = int(cur["transactions"]) or 0
    gpm = round(gp / rev * 100, 2) if rev else 0.0
    prev_rev, prev_gp = float(prev["revenue"]), float(prev["gross_profit"])
    prev_gpm = (prev_gp / prev_rev * 100) if prev_rev else 0.0

    return jsonify({
        "window": "trailing 90 days",
        "gross_profit_margin_pct": gpm,
        "gross_profit_margin_delta_pct": round(gpm - prev_gpm, 1),
        "avg_transaction_value": round(rev / txns, 2) if txns else 0.0,
        "sku_count": sku_count,
        "last_sync": last_sync,
        "historical_window": (f"approximately {span['y0']} to {span['y1']}"
                              if span and span["y0"] else "no history yet"),
    })


@bp.route("/api/velocity")
@login_required
@owner_only
def api_velocity():
    """ABC-style velocity classification by trailing-90-day revenue share."""
    with dw_conn() as d:
        rows = q(d, """
            SELECT sku, product_name, category_name, units_90d, revenue_90d,
                   gross_profit_90d
            FROM vw_product_velocity ORDER BY revenue_90d DESC
        """)
    total = sum(float(r["revenue_90d"]) for r in rows) or 1.0
    cum = 0.0
    for r in rows:
        rev = float(r["revenue_90d"]); r["revenue_90d"] = round(rev, 2)
        r["gross_profit_90d"] = round(float(r["gross_profit_90d"]), 2)
        cum += rev
        share = cum / total
        r["class"] = "A" if share <= 0.8 else ("B" if share <= 0.95 else "C")
    return jsonify(rows)


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
        rows.append({"sku": p["sku"], "name": p["name"], "movement": movement,
                     "stock_on_hand": soh, "reorder_point": rop,
                     "status": status, "_sev": sev, "_u": u})
    rows.sort(key=lambda r: (r["_sev"], -r["_u"]))
    for r in rows:
        r.pop("_sev"); r.pop("_u")
    return jsonify(rows)


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
