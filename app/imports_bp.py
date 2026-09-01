"""Data Import (owner only). One-time migration of the enterprise's legacy
records: upload the sales-records and product-catalog files, then run the
import. Ongoing sales are recorded through Sales Entry / Stock In, never here."""
import csv
import io
from pathlib import Path

from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required
from werkzeug.utils import secure_filename

from config import config
from .db import ops_conn, q
from .security import owner_only

bp = Blueprint("imports", __name__, url_prefix="/import")

ALLOWED_EXT = {".csv", ".xlsx", ".xls"}
CATALOG_HINTS = ("catalog", "product", "item", "sku_list")
SALES_HINTS = ("sales", "record", "transaction", "txn", "history")


@bp.route("/")
@login_required
@owner_only
def screen():
    return render_template("imports.html")


def _detect_kind(filename: str, head: str) -> str | None:
    low = filename.lower()
    if any(h in low for h in CATALOG_HINTS):
        return "product_catalog"
    if any(h in low for h in SALES_HINTS):
        return "sales_records"
    cols = {c.strip().lower() for c in head.split(",")}
    if {"date", "quantity"} & cols or {"qty", "date"} <= cols:
        return "sales_records"
    if {"unit_price", "price", "reorder_point", "opening_stock"} & cols:
        return "product_catalog"
    return None


@bp.route("/api/upload", methods=["POST"])
@login_required
@owner_only
def api_upload():
    config.HISTORICAL_DIR.mkdir(parents=True, exist_ok=True)
    saved, skipped = [], []
    for f in request.files.getlist("files"):
        name = secure_filename(f.filename or "")
        ext = Path(name).suffix.lower()
        if ext not in ALLOWED_EXT:
            skipped.append({"file": name, "why": "type not accepted"}); continue
        raw = f.read()
        head = ""
        if ext == ".csv":
            head = raw[:2048].decode("utf-8", "ignore").splitlines()[0] if raw else ""
        kind = _detect_kind(name, head)
        if not kind:
            skipped.append({"file": name,
                            "why": "could not tell if this is sales or catalog "
                                   "(rename to include 'sales' or 'catalog')"})
            continue
        target = config.HISTORICAL_DIR / f"{kind}{ext}"
        # remove any other-extension copy of the same slot
        for other in ALLOWED_EXT:
            p = config.HISTORICAL_DIR / f"{kind}{other}"
            if p.exists() and p != target:
                p.unlink()
        target.write_bytes(raw)
        saved.append({"file": name, "slot": kind,
                      "rows": max(0, raw.count(b"\n") - 1) if ext == ".csv" else None})
    return jsonify(ok=bool(saved), saved=saved, skipped=skipped)


@bp.route("/api/status")
@login_required
@owner_only
def api_status():
    files = []
    for stem in ("sales_records", "product_catalog"):
        found = None
        for ext in (".csv", ".xlsx", ".xls"):
            p = config.HISTORICAL_DIR / f"{stem}{ext}"
            if p.exists():
                found = {"name": p.name, "size_kb": round(p.stat().st_size / 1024, 1)}
                break
        files.append({"stem": stem, "file": found})

    with ops_conn() as c:
        runs = q(c, """
            SELECT run_id, run_type, trigger_source, started_ts, finished_ts, status,
                   rows_read, rows_loaded, dcr, drr, lsr, message
            FROM etl_runs ORDER BY run_id DESC LIMIT 20
        """)
    hist = []
    for r in runs:
        label = ("sales_records + product_catalog"
                 if r["run_type"] == "historical_import" else "incremental sync")
        hist.append({
            "file": label,
            "date": r["started_ts"].strftime("%b %d, %Y %H:%M"),
            "rows": r["rows_loaded"] if r["status"] == "success" else None,
            "status": "Success" if r["status"] == "success"
                      else ("Failed" if r["status"] == "failed" else "Running"),
            "dcr": float(r["dcr"]) if r["dcr"] is not None else None,
            "drr": float(r["drr"]) if r["drr"] is not None else None,
            "lsr": float(r["lsr"]) if r["lsr"] is not None else None,
            "message": r["message"] or "",
        })
    return jsonify({"folder": str(config.HISTORICAL_DIR), "files": files,
                    "history": hist, "batches": len(hist),
                    "max_mb": config.MAX_UPLOAD_MB})


@bp.route("/api/run", methods=["POST"])
@login_required
@owner_only
def api_run():
    from .etl import historical_import
    try:
        return jsonify(ok=True, **historical_import.run(trigger_source="deployment"))
    except FileNotFoundError as e:
        return jsonify(ok=False, error=str(e)), 400
