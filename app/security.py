"""Authentication + Role-Based Access Control (paper 1.5.1).

Two roles:
  owner  -> full access (sales, stock-in, products, analytics, forecasting,
            alerts, rule config, all financial figures)
  staff  -> direct sales entry + stock-in screens only. No analytics, no
            forecasts, no alerts, no unit cost / gross profit.
"""
from functools import wraps
import bcrypt
from flask import abort
from flask_login import UserMixin, current_user
from .db import ops_conn, q


class User(UserMixin):
    def __init__(self, row: dict):
        self.id = str(row["user_id"])
        self.username = row["username"]
        self.full_name = row["full_name"]
        self.role = row["role"]
        self.is_active_flag = bool(row["is_active"])

    @property
    def is_active(self):          # Flask-Login hook
        return self.is_active_flag

    @property
    def is_owner(self):
        return self.role == "owner"


def load_user(user_id: str):
    with ops_conn() as c:
        rows = q(c, "SELECT * FROM users WHERE user_id = :id AND is_active = 1",
                 id=user_id)
    return User(rows[0]) if rows else None


def authenticate(username: str, password: str):
    with ops_conn() as c:
        rows = q(c, "SELECT * FROM users WHERE username = :u AND is_active = 1",
                 u=username)
    if not rows:
        return None
    row = rows[0]
    if bcrypt.checkpw(password.encode("utf-8"), row["password_hash"].encode("utf-8")):
        return User(row)
    return None


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def role_required(*roles):
    """Guard a view so only the listed roles may enter."""
    def deco(fn):
        @wraps(fn)
        def wrapper(*a, **kw):
            if not current_user.is_authenticated:
                abort(401)
            if current_user.role not in roles:
                abort(403)
            return fn(*a, **kw)
        return wrapper
    return deco


owner_only = role_required("owner")
