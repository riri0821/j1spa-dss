"""Shared ETL helpers: dimension upserts, key builders, transform primitives,
and the three data-quality metrics from paper section 3.2 (DCR, DRR, LSR)."""
from __future__ import annotations
import re
from datetime import date, datetime
import pandas as pd
from sqlalchemy import text

CRITICAL_SALE_FIELDS = ["sku", "quantity", "unit_price", "unit_cost", "txn_date"]


# ----------------------------- transform primitives -----------------------------
def std_text(value) -> str:
    """Trim, collapse whitespace, title-case-safe lower for matching keys."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    return re.sub(r"\s+", " ", str(value).strip())


def norm_key(value) -> str:
    return std_text(value).lower()


def parse_date(value):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, (datetime, pd.Timestamp)):
        return value.date()
    if isinstance(value, date):
        return value
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d", "%m-%d-%Y",
                "%d-%b-%Y", "%b %d, %Y", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(str(value).strip(), fmt).date()
        except ValueError:
            continue
    try:
        return pd.to_datetime(value).date()
    except Exception:
        return None


def date_key(d: date) -> int:
    return d.year * 10000 + d.month * 100 + d.day


# ----------------------------- quality metrics --------------------------------
def data_completeness_rate(df: pd.DataFrame, critical_cols: list[str]) -> float:
    """DCR = rows with no missing critical field / total rows * 100."""
    if len(df) == 0:
        return 100.0
    present = df[critical_cols].notna().all(axis=1)
    non_empty = present & df[critical_cols].astype(str).apply(
        lambda s: s.str.strip().ne("")
    ).all(axis=1)
    return round(float(non_empty.mean()) * 100.0, 2)


def duplicate_reduction_rate(raw_count: int, dedup_count: int) -> float:
    if raw_count == 0:
        return 0.0
    return round((raw_count - dedup_count) / raw_count * 100.0, 2)


def load_success_rate(transformed: int, loaded: int) -> float:
    if transformed == 0:
        return 100.0
    return round(loaded / transformed * 100.0, 2)


# ----------------------------- dimension upserts ------------------------------
def get_or_create_simple(conn, table: str, key_col: str, name_col: str, value: str) -> int:
    value = value or "Unknown"
    row = conn.execute(
        text(f"SELECT {key_col} FROM {table} WHERE {name_col} = :v"), {"v": value}
    ).first()
    if row:
        return row[0]
    res = conn.execute(text(f"INSERT INTO {table} ({name_col}) VALUES (:v)"), {"v": value})
    return res.lastrowid


def source_key(conn, source_type: str) -> int:
    return get_or_create_simple(conn, "dim_source", "source_key", "source_type", source_type)


def ensure_date_key(conn, d: date) -> int:
    dk = date_key(d)
    exists = conn.execute(text("SELECT 1 FROM dim_date WHERE date_key = :k"), {"k": dk}).first()
    if not exists:
        conn.execute(text("""
            INSERT INTO dim_date (date_key, full_date, year, quarter, month, month_name,
                                  week_of_year, day_of_month, day_of_week, day_name, is_weekend)
            VALUES (:k, :fd, :y, :q, :m, :mn, :w, :dom, :dow, :dn, :we)
        """), {
            "k": dk, "fd": d, "y": d.year, "q": (d.month - 1) // 3 + 1, "m": d.month,
            "mn": d.strftime("%B"), "w": int(d.strftime("%W")), "dom": d.day,
            "dow": d.isoweekday(), "dn": d.strftime("%A"), "we": 1 if d.isoweekday() >= 6 else 0,
        })
    return dk


def upsert_dim_product(conn, p: dict) -> int:
    """p keys: product_id, sku, name, category, brand, supplier, unit_cost,
    unit_price, reorder_point. Returns product_key."""
    ck = get_or_create_simple(conn, "dim_category", "category_key", "category_name",
                              p.get("category") or "Uncategorized")
    bk = get_or_create_simple(conn, "dim_brand", "brand_key", "brand_name",
                              p.get("brand") or "Generic")
    sk = get_or_create_simple(conn, "dim_supplier", "supplier_key", "supplier_name",
                              p.get("supplier") or "Unknown")
    params = {
        "pid": p["product_id"], "sku": p["sku"], "name": p["name"],
        "ck": ck, "bk": bk, "sk": sk,
        "uc": p.get("unit_cost", 0), "up": p.get("unit_price", 0),
        "rop": p.get("reorder_point", 0),
    }
    existing = conn.execute(text("SELECT product_key FROM dim_product WHERE sku = :sku"),
                            {"sku": p["sku"]}).first()
    if existing:
        conn.execute(text("""
            UPDATE dim_product SET product_id=:pid, name=:name, category_key=:ck,
                   brand_key=:bk, supplier_key=:sk, unit_cost=:uc, unit_price=:up,
                   reorder_point=:rop
            WHERE sku = :sku
        """), params)
        return existing[0]
    res = conn.execute(text("""
        INSERT INTO dim_product (product_id, sku, name, category_key, brand_key,
               supplier_key, unit_cost, unit_price, reorder_point)
        VALUES (:pid, :sku, :name, :ck, :bk, :sk, :uc, :up, :rop)
    """), params)
    return res.lastrowid
