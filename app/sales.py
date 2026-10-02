"""Direct Sales Entry (paper 1.4.2 obj. 1, 3.10.5). Available to owner and
staff. A recorded sale can be undone (Recent Sales "Undo"): stock is put
back, the sale is marked voided and dropped from Recent Sales, and the next
ETL sync removes it from the warehouse so it no longer counts toward the
dashboard's today's-profit figure. Writes to the operational database only;
the ETL later consolidates these rows into the warehouse. No unit cost or
gross profit is shown here."""
import datetime
from flask import Blueprint, render_template, request, jsonify, abort
from flask_login import login_required, current_user
from sqlalchemy import text, bindparam

from .db import ops_conn, q

_LOCK_PRODUCTS = text("""
    SELECT product_id, sku, name, unit_price, unit_cost, stock_on_hand
    FROM products WHERE product_id IN :ids FOR UPDATE
""").bindparams(bindparam("ids", expanding=True))

bp = Blueprint("sales", __name__, url_prefix="/sales")


@bp.route("/")
@login_required
def screen():
    return render_template("sales.html")


@bp.route("/api/products")
@login_required
def api_products():
    term = f"%{request.args.get('q', '').strip()}%"
    with ops_conn() as c:
        rows = q(c, """
            SELECT product_id, sku, name, category, brand,
                   unit_price, stock_on_hand
            FROM products
            WHERE is_active = 1 AND (name LIKE :t OR sku LIKE :t OR brand LIKE :t)
            ORDER BY name LIMIT 100
        """, t=term)
    for r in rows:
        r["unit_price"] = float(r["unit_price"])
    return jsonify(rows)


@bp.route("/confirm", methods=["POST"])
@login_required
def confirm():
    payload = request.get_json(silent=True) or {}
    lines = payload.get("items") or []
    note = (payload.get("note") or "").strip()[:255]
    cleaned = []
    for ln in lines:
        try:
            pid = int(ln["product_id"]); qty = int(ln["qty"])
        except (KeyError, ValueError, TypeError):
            return jsonify(error="Bad line item."), 400
        if qty > 0:
            cleaned.append((pid, qty))
    if not cleaned:
        return jsonify(error="No items to record."), 400

    with ops_conn() as c:
        # lock the product rows we are about to touch
        ids = sorted({pid for pid, _ in cleaned})
        prods = {r._mapping["product_id"]: dict(r._mapping)
                 for r in c.execute(_LOCK_PRODUCTS, {"ids": ids})}

        for pid, qty in cleaned:
            p = prods.get(pid)
            if not p:
                return jsonify(error=f"Product {pid} not found."), 400
            if qty > p["stock_on_hand"]:
                return jsonify(error=(f"Not enough stock for {p['name']} "
                                      f"(on hand {p['stock_on_hand']}, requested {qty}).")), 409

        total_rev = sum(qty * float(prods[pid]["unit_price"]) for pid, qty in cleaned)
        total_cost = sum(qty * float(prods[pid]["unit_cost"]) for pid, qty in cleaned)

        sale_id = c.execute(text("""
            INSERT INTO sales (user_id, user_role, total_amount, total_cost, note)
            VALUES (:uid, :role, :amt, :cost, :note)
        """), {"uid": int(current_user.id), "role": current_user.role,
               "amt": round(total_rev, 2), "cost": round(total_cost, 2),
               "note": note or None}).lastrowid

        for pid, qty in cleaned:
            p = prods[pid]
            up, uc = float(p["unit_price"]), float(p["unit_cost"])
            c.execute(text("""
                INSERT INTO sale_items (sale_id, product_id, sku, quantity,
                    unit_price, unit_cost, line_revenue, line_cost)
                VALUES (:sid,:pid,:sku,:q,:up,:uc,:lr,:lc)
            """), {"sid": sale_id, "pid": pid, "sku": p["sku"], "q": qty,
                   "up": up, "uc": uc, "lr": round(qty * up, 2), "lc": round(qty * uc, 2)})
            new_bal = p["stock_on_hand"] - qty
            c.execute(text("UPDATE products SET stock_on_hand = :b WHERE product_id = :pid"),
                      {"b": new_bal, "pid": pid})
            c.execute(text("""
                INSERT INTO stock_movements (product_id, sku, movement_type, quantity,
                    balance_after, user_id, reference)
                VALUES (:pid,:sku,'sale_decrement',:q,:bal,:uid,:ref)
            """), {"pid": pid, "sku": p["sku"], "q": -qty, "bal": new_bal,
                   "uid": int(current_user.id), "ref": f"sale:{sale_id}"})

    return jsonify(sale_id=sale_id, total_amount=round(total_rev, 2),
                   lines=len(cleaned))


@bp.route("/recent")
@login_required
def recent():
    """Most recent confirmed sales. Undone sales drop off this list entirely
    (see undo() below) rather than showing with a "voided" status."""
    with ops_conn() as c:
        sales = q(c, """
            SELECT s.sale_id, s.sale_ts, s.total_amount, s.note, s.user_id,
                   u.full_name AS cashier,
                   (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.sale_id) AS line_count
            FROM sales s JOIN users u ON u.user_id = s.user_id
            WHERE s.status = 'confirmed'
            ORDER BY s.sale_id DESC LIMIT 25
        """)
    today = datetime.date.today()
    for s in sales:
        # staff may undo only their own sale on the same day; owner may undo any
        s["can_undo"] = (current_user.is_owner
                          or (str(s["user_id"]) == current_user.id
                              and s["sale_ts"].date() == today))
        del s["user_id"]
        s["sale_ts"] = s["sale_ts"].strftime("%Y-%m-%d %H:%M")
        s["total_amount"] = float(s["total_amount"])
        s["lines"] = s.pop("line_count")
    return jsonify(sales)


@bp.route("/<int:sale_id>/undo", methods=["POST"])
@login_required
def undo(sale_id):
    """Undo a sale: restore stock, mark the sale voided (it drops off Recent
    Sales), and flag it unsynced so the next ETL run removes it from the
    warehouse - the dashboard's today's-profit figure updates on that sync,
    same as any other sale."""
    with ops_conn() as c:
        s = q(c, "SELECT * FROM sales WHERE sale_id = :id FOR UPDATE", id=sale_id)
        if not s:
            abort(404)
        s = s[0]
        if s["status"] == "voided":
            return jsonify(error="Already undone."), 409
        if not current_user.is_owner and (
            str(s["user_id"]) != current_user.id
            or s["sale_ts"].date() != datetime.date.today()
        ):
            abort(403)

        items = q(c, "SELECT product_id, sku, quantity FROM sale_items WHERE sale_id = :id",
                  id=sale_id)
        for it in items:
            row = q(c, "SELECT stock_on_hand FROM products WHERE product_id = :p FOR UPDATE",
                    p=it["product_id"])[0]
            new_bal = row["stock_on_hand"] + it["quantity"]
            c.execute(text("UPDATE products SET stock_on_hand = :b WHERE product_id = :p"),
                      {"b": new_bal, "p": it["product_id"]})
            c.execute(text("""
                INSERT INTO stock_movements (product_id, sku, movement_type, quantity,
                    balance_after, user_id, reference)
                VALUES (:pid,:sku,'void_increment',:q,:bal,:uid,:ref)
            """), {"pid": it["product_id"], "sku": it["sku"], "q": it["quantity"],
                   "bal": new_bal, "uid": int(current_user.id), "ref": f"undo:{sale_id}"})
        c.execute(text("""
            UPDATE sales SET status='voided', voided_ts=NOW(), synced_dw=0
            WHERE sale_id = :id
        """), {"id": sale_id})
    return jsonify(ok=True, sale_id=sale_id)


@bp.route("/<int:sale_id>/items")
@login_required
def items(sale_id):
    """Line items for one sale, for the Recent Sales '#' click-through popup."""
    with ops_conn() as c:
        sale = q(c, """
            SELECT s.sale_id, s.sale_ts, s.total_amount, s.note, u.full_name AS cashier
            FROM sales s JOIN users u ON u.user_id = s.user_id
            WHERE s.sale_id = :id
        """, id=sale_id)
        if not sale:
            abort(404)
        rows = q(c, """
            SELECT si.sku, p.name, si.quantity, si.unit_price, si.line_revenue
            FROM sale_items si JOIN products p ON p.product_id = si.product_id
            WHERE si.sale_id = :id
            ORDER BY si.sale_item_id
        """, id=sale_id)
    for r in rows:
        r["unit_price"] = float(r["unit_price"])
        r["line_revenue"] = float(r["line_revenue"])
    sale = sale[0]
    sale["sale_ts"] = sale["sale_ts"].strftime("%Y-%m-%d %H:%M")
    sale["total_amount"] = float(sale["total_amount"])
    return jsonify(sale=sale, items=rows)
