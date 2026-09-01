"""Time-Series Demand Forecasting Workspace (owner only, paper 3.5 / 3.10.3).
Runs the five-model comparison for a chosen SKU and shows MSE/MAPE/RMSE, the
selected model, the 30-day demand figure and the days-to-depletion estimate."""
from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required
from sqlalchemy import text

from .db import ops_conn, q
from .security import owner_only
from .forecast.service import forecast_product

bp = Blueprint("forecasting", __name__, url_prefix="/forecasting")


@bp.route("/")
@login_required
@owner_only
def workspace():
    return render_template("forecasting.html")


@bp.route("/api/skus")
@login_required
@owner_only
def api_skus():
    term = f"%{request.args.get('q', '').strip()}%"
    with ops_conn() as c:
        rows = q(c, """
            SELECT sku, name, stock_on_hand FROM products
            WHERE is_active = 1 AND (sku LIKE :t OR name LIKE :t)
            ORDER BY name LIMIT 50
        """, t=term)
    return jsonify(rows)


SHORT_TO_FULL = {
    "MA": "Simple Moving Average", "WMA": "Weighted Moving Average",
    "Linear Regression": "Linear Regression", "ARIMA": "ARIMA",
    "Holt-Winters": "Holt-Winters",
}


@bp.route("/api/run")
@login_required
@owner_only
def api_run():
    sku = request.args.get("sku", "").strip().upper()
    if not sku:
        return jsonify(error="Provide ?sku="), 400
    try:
        horizon = int(request.args.get("horizon", 30))
    except ValueError:
        horizon = 30
    horizon = max(7, min(horizon, 90))

    raw = request.args.get("models", "").strip()
    allowed = {SHORT_TO_FULL[m] for m in raw.split(",")
              if m in SHORT_TO_FULL} if raw else None
    return jsonify(forecast_product(sku, horizon, allowed))
