"""Stock-In / Inventory Movement screen (paper 3.10.5). Available to owner and
staff. Records deliveries (stock_in) and manual corrections (adjustment) with
the same on-screen quantity control as the sales screen."""
from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required, current_user
from sqlalchemy import text

from .db import ops_conn, q

bp = Blueprint("stockin", __name__, url_prefix="/stockin")


@bp.route("/")
@login_required
def screen():
    return render_template("stockin.html")


@bp.route("/api/products")
@login_required
def api_products():
    term = f"%{request.args.get('q', '').strip()}%"
    with ops_conn() as c:
        rows = q(c, """
            SELECT product_id, sku, name, brand, stock_on_hand, reorder_point
            FROM products WHERE is_active = 1
              AND (name LIKE :t OR sku LIKE :t OR brand LIKE :t)
            ORDER BY name LIMIT 100
        """, t=term)
    return jsonify(rows)


@bp.route("/confirm", methods=["POST"])
@login_required
def confirm():
    payload = request.get_json(silent=True) or {}
    kind = payload.get("type", "stock_in")
    if kind not in ("stock_in", "adjustment"):
        return jsonify(error="Bad movement type."), 400
    reference = (payload.get("reference") or "").strip()[:80]
    lines = payload.get("items") or []

    cleaned = []
    for ln in lines:
        try:
            pid = int(ln["product_id"]); qty = int(ln["qty"])
        except (KeyError, ValueError, TypeError):
            return jsonify(error="Bad line item."), 400
        if kind == "stock_in" and qty <= 0:
            return jsonify(error="Stock-in quantity must be positive."), 400
        if qty == 0:
            continue
        cleaned.append((pid, qty))
    if not cleaned:
        return jsonify(error="Nothing to record."), 400

    recorded = []
    with ops_conn() as c:
        for pid, qty in cleaned:
            row = q(c, "SELECT sku, name, stock_on_hand FROM products "
                       "WHERE product_id = :p FOR UPDATE", p=pid)
            if not row:
                return jsonify(error=f"Product {pid} not found."), 400
            row = row[0]
            new_bal = row["stock_on_hand"] + qty
            if new_bal < 0:
                return jsonify(error=(f"Adjustment would make {row['name']} negative "
                                      f"({row['stock_on_hand']} {qty:+d}).")), 409
            c.execute(text("UPDATE products SET stock_on_hand = :b WHERE product_id = :p"),
                      {"b": new_bal, "p": pid})
            c.execute(text("""
                INSERT INTO stock_movements (product_id, sku, movement_type, quantity,
                    balance_after, user_id, reference)
                VALUES (:pid,:sku,:mt,:q,:bal,:uid,:ref)
            """), {"pid": pid, "sku": row["sku"], "mt": kind, "q": qty,
                   "bal": new_bal, "uid": int(current_user.id), "ref": reference or None})
            recorded.append({"sku": row["sku"], "name": row["name"],
                             "change": qty, "balance": new_bal})
    return jsonify(ok=True, recorded=recorded)
