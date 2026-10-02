"""Product Management (owner only, paper 3.10.5). Add / edit catalog items:
name, category, brand, cost, price, reorder point, opening stock."""
from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required, current_user
from sqlalchemy import text

from .db import ops_conn, q
from .security import owner_only

bp = Blueprint("products", __name__, url_prefix="/products")


@bp.route("/")
@login_required
@owner_only
def screen():
    return render_template("products.html")


@bp.route("/api/list")
@login_required
@owner_only
def api_list():
    term = f"%{request.args.get('q', '').strip()}%"
    with ops_conn() as c:
        rows = q(c, """
            SELECT product_id, sku, name, category, brand, supplier, vehicle_compat,
                   unit_cost, unit_price, reorder_point, stock_on_hand, is_active,
                   source_type
            FROM products
            WHERE name LIKE :t OR sku LIKE :t OR brand LIKE :t OR category LIKE :t
            ORDER BY name LIMIT 500
        """, t=term)
    for r in rows:
        r["unit_cost"] = float(r["unit_cost"])
        r["unit_price"] = float(r["unit_price"])
    return jsonify(rows)


@bp.route("/api/categories")
@login_required
@owner_only
def api_categories():
    """Distinct categories already in use, for the Add/Edit Product dropdown
    (keeps category names consistent instead of free-typed variants)."""
    with ops_conn() as c:
        rows = q(c, "SELECT DISTINCT category FROM products ORDER BY category")
    return jsonify([r["category"] for r in rows])


@bp.route("/api/delete", methods=["POST"])
@login_required
@owner_only
def api_delete():
    """Remove a catalog item. A product with recorded sales, stock movements,
    or alerts can't be hard-deleted without breaking that history, so it's
    deactivated (hidden from active lists) instead."""
    data = request.get_json(silent=True) or {}
    pid = data.get("product_id")
    if pid is None:
        return jsonify(error="product_id is required."), 400
    try:
        pid = int(pid)
    except (TypeError, ValueError):
        return jsonify(error="product_id must be an integer."), 400

    with ops_conn() as c:
        prod = q(c, "SELECT sku FROM products WHERE product_id = :pid", pid=pid)
        if not prod:
            return jsonify(error="Product not found."), 404
        sku = prod[0]["sku"]

        in_use = q(c, """
            SELECT
              (SELECT COUNT(*) FROM sale_items      WHERE product_id = :pid) AS si,
              (SELECT COUNT(*) FROM stock_movements  WHERE product_id = :pid) AS sm,
              (SELECT COUNT(*) FROM alerts            WHERE product_id = :pid) AS al
        """, pid=pid)[0]

        if in_use["si"] or in_use["sm"] or in_use["al"]:
            c.execute(text("UPDATE products SET is_active = 0 WHERE product_id = :pid"),
                      {"pid": pid})
            return jsonify(ok=True, mode="deactivated", product_id=pid,
                           message=f"{sku} has recorded sales/stock history, so it was "
                                   f"deactivated instead of deleted.")

        c.execute(text("DELETE FROM products WHERE product_id = :pid"), {"pid": pid})
        return jsonify(ok=True, mode="deleted", product_id=pid, message=f"{sku} deleted.")


def _form_values(form):
    return {
        "sku": form.get("sku", "").strip().upper(),
        "name": form.get("name", "").strip(),
        "category": form.get("category", "").strip() or "Uncategorized",
        "brand": form.get("brand", "").strip() or "Generic",
        "supplier": form.get("supplier", "").strip() or "Unknown",
        "vehicle_compat": form.get("vehicle_compat", "").strip() or None,
        "unit_cost": float(form.get("unit_cost") or 0),
        "unit_price": float(form.get("unit_price") or 0),
        "reorder_point": int(form.get("reorder_point") or 0),
        "opening_stock": int(form.get("opening_stock") or 0),
        "is_active": 1 if form.get("is_active", "1") in ("1", "on", "true") else 0,
    }


@bp.route("/save", methods=["POST"])
@login_required
@owner_only
def save():
    pid = request.form.get("product_id")
    v = _form_values(request.form)
    if not v["sku"] or not v["name"]:
        return jsonify(error="SKU and name are required."), 400

    with ops_conn() as c:
        if pid:  # update (opening_stock is not editable here; use Stock-In adjustments)
            # vehicle_compat has no field in the edit form, so it's deliberately left
            # out of this UPDATE - including it would null out any existing value
            # (e.g. from historical import) on every save.
            c.execute(text("""
                UPDATE products SET name=:name, category=:category, brand=:brand,
                    supplier=:supplier,
                    unit_cost=:unit_cost, unit_price=:unit_price,
                    reorder_point=:reorder_point, is_active=:is_active
                WHERE product_id = :pid
            """), {**v, "pid": int(pid)})
            return jsonify(ok=True, product_id=int(pid), mode="updated")

        dup = q(c, "SELECT product_id FROM products WHERE sku = :s", s=v["sku"])
        if dup:
            return jsonify(error=f"SKU {v['sku']} already exists."), 409
        new_id = c.execute(text("""
            INSERT INTO products (sku, name, category, brand, supplier, vehicle_compat,
                unit_cost, unit_price, reorder_point, stock_on_hand, is_active,
                source_type)
            VALUES (:sku,:name,:category,:brand,:supplier,:vehicle_compat,
                    :unit_cost,:unit_price,:reorder_point,:opening_stock,:is_active,
                    'Direct Sales Entry')
        """), v).lastrowid
        if v["opening_stock"]:
            c.execute(text("""
                INSERT INTO stock_movements (product_id, sku, movement_type, quantity,
                    balance_after, user_id, reference, note)
                VALUES (:pid,:sku,'adjustment',:q,:bal,:uid,'opening','opening stock')
            """), {"pid": new_id, "sku": v["sku"], "q": v["opening_stock"],
                   "bal": v["opening_stock"], "uid": int(current_user.id)})
    return jsonify(ok=True, product_id=new_id, mode="created")
