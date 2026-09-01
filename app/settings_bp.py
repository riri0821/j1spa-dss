"""Settings (owner only): change your password, add a staff account, and see
who can sign in. RBAC config lives here per paper 1.5.1."""
import secrets

from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required, current_user
from sqlalchemy import text

from .db import ops_conn, q
from .security import owner_only, hash_password, authenticate

bp = Blueprint("settings", __name__, url_prefix="/settings")


@bp.route("/")
@login_required
@owner_only
def screen():
    return render_template("settings.html")


@bp.route("/api/users")
@login_required
@owner_only
def api_users():
    with ops_conn() as c:
        rows = q(c, """SELECT user_id, username, full_name, role, is_active, created_at
                       FROM users WHERE username <> '_former_staff'
                       ORDER BY role, username""")
    for r in rows:
        r["created_at"] = r["created_at"].strftime("%Y-%m-%d")
    return jsonify(rows)


@bp.route("/api/change-password", methods=["POST"])
@login_required
@owner_only
def change_password():
    d = request.get_json(silent=True) or {}
    if not authenticate(current_user.username, d.get("current", "")):
        return jsonify(error="Current password is incorrect."), 403
    new = d.get("new", "")
    if len(new) < 6:
        return jsonify(error="New password must be at least 6 characters."), 400
    with ops_conn() as c:
        c.execute(text("UPDATE users SET password_hash=:p WHERE user_id=:id"),
                  {"p": hash_password(new), "id": int(current_user.id)})
    return jsonify(ok=True)


@bp.route("/api/add-staff", methods=["POST"])
@login_required
@owner_only
def add_staff():
    d = request.get_json(silent=True) or {}
    username = (d.get("username") or "").strip()
    name = (d.get("name") or "").strip()
    pw = d.get("password") or ""
    if not username or not name or len(pw) < 6:
        return jsonify(error="Username, name, and a 6+ char password are required."), 400
    with ops_conn() as c:
        if c.execute(text("SELECT 1 FROM users WHERE username=:u"), {"u": username}).first():
            return jsonify(error="Username already exists."), 409
        c.execute(text("""INSERT INTO users (username, full_name, password_hash, role)
                          VALUES (:u,:n,:p,'staff')"""),
                  {"u": username, "n": name, "p": hash_password(pw)})
    return jsonify(ok=True)


@bp.route("/api/toggle/<int:user_id>", methods=["POST"])
@login_required
@owner_only
def toggle(user_id):
    if user_id == int(current_user.id):
        return jsonify(error="You cannot deactivate your own account."), 400
    with ops_conn() as c:
        c.execute(text("UPDATE users SET is_active = 1 - is_active WHERE user_id=:id"),
                  {"id": user_id})
    return jsonify(ok=True)


FORMER_STAFF_USERNAME = "_former_staff"


def _former_staff_id(c) -> int:
    """The placeholder that inherits a deleted staff member's history."""
    row = c.execute(text("SELECT user_id FROM users WHERE username=:u"),
                    {"u": FORMER_STAFF_USERNAME}).first()
    if row:
        return row.user_id
    return c.execute(text("""
        INSERT INTO users (username, full_name, password_hash, role, is_active)
        VALUES (:u, 'Former staff', :p, 'staff', 0)
    """), {"u": FORMER_STAFF_USERNAME, "p": hash_password(secrets.token_hex(16))}).lastrowid


@bp.route("/api/delete/<int:user_id>", methods=["POST"])
@login_required
@owner_only
def delete_user(user_id):
    if user_id == int(current_user.id):
        return jsonify(error="You cannot delete your own account."), 400
    with ops_conn() as c:
        row = c.execute(text("SELECT username, role FROM users WHERE user_id=:id"),
                        {"id": user_id}).first()
        if not row:
            return jsonify(error="User not found."), 404
        if row.role != "staff":
            return jsonify(error="Only staff accounts can be deleted."), 400
        if row.username == FORMER_STAFF_USERNAME:
            return jsonify(error="The 'Former staff' placeholder cannot be deleted."), 400

        n_sales = c.execute(text("SELECT COUNT(*) FROM sales WHERE user_id=:id"),
                            {"id": user_id}).scalar()
        n_moves = c.execute(text("SELECT COUNT(*) FROM stock_movements WHERE user_id=:id"),
                            {"id": user_id}).scalar()
        reassigned = 0
        if n_sales or n_moves:
            fid = _former_staff_id(c)
            c.execute(text("UPDATE sales SET user_id=:f WHERE user_id=:id"),
                      {"f": fid, "id": user_id})
            c.execute(text("UPDATE stock_movements SET user_id=:f WHERE user_id=:id"),
                      {"f": fid, "id": user_id})
            reassigned = n_sales + n_moves
        c.execute(text("DELETE FROM users WHERE user_id=:id"), {"id": user_id})
    return jsonify(ok=True, reassigned=reassigned)
