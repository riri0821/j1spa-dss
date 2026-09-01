"""Forecasting workspace service: pull an item's monthly demand history from
the warehouse, run the five-model comparison, and translate the winning
forecast into a 30-day demand figure, a forward daily curve for the chart,
and a days-to-depletion / coverage-gap estimate (paper 3.5 / 3.10.3)."""
from __future__ import annotations
import calendar
import numpy as np
import pandas as pd
from sqlalchemy import text

from config import config
from ..db import dw_engine, ops_engine
from .evaluate import evaluate_all
from .models import forecast_n, SHORT


def monthly_series(sku: str) -> pd.Series:
    """Gap-free monthly unit-demand series for one SKU from fact_transactions."""
    with dw_engine.begin() as dc:
        rows = dc.execute(text("""
            SELECT d.year, d.month, SUM(f.quantity) AS units
            FROM fact_transactions f
            JOIN dim_date d    ON d.date_key = f.date_key
            JOIN dim_product p ON p.product_key = f.product_key
            WHERE p.sku = :sku
            GROUP BY d.year, d.month
            ORDER BY d.year, d.month
        """), {"sku": sku}).all()
    if not rows:
        return pd.Series(dtype=float)
    idx = pd.PeriodIndex(
        [pd.Period(year=r[0], month=r[1], freq="M") for r in rows], freq="M")
    s = pd.Series([float(r[2]) for r in rows], index=idx)
    full = pd.period_range(s.index.min(), s.index.max(), freq="M")
    return s.reindex(full, fill_value=0.0)


def _product_ctx(sku: str) -> dict | None:
    with ops_engine.begin() as oc:
        r = oc.execute(text("""
            SELECT product_id, sku, name, stock_on_hand, reorder_point,
                   unit_cost, unit_price
            FROM products WHERE sku = :sku
        """), {"sku": sku}).first()
    if not r:
        return None
    return {"product_id": r[0], "sku": r[1], "name": r[2], "stock_on_hand": r[3],
            "reorder_point": r[4], "unit_cost": float(r[5]), "unit_price": float(r[6])}


def _daily_curve(y: pd.Series, best: str, horizon: int) -> tuple[list[float], float]:
    """A smooth day-by-day demand path for the chart's forecast segment.
    Ramps from the last observed daily rate toward the model's next-month
    rate, extended with the second month if the horizon needs it."""
    path_months = forecast_n(best, y, max(1, (horizon + 29) // 30 + 1))
    last_month_units = float(y.iloc[-1]) if len(y) else path_months[0]
    start_rate = last_month_units / 30.0
    curve = []
    for d in range(1, horizon + 1):
        mo = (d - 1) // 30
        target_rate = path_months[min(mo, len(path_months) - 1)] / 30.0
        # linear ramp within the current 30-day block
        frac = ((d - 1) % 30 + 1) / 30.0
        base = (path_months[mo - 1] / 30.0) if mo > 0 else start_rate
        curve.append(round(base + (target_rate - base) * frac, 4))
    total = round(sum(curve), 2)
    return curve, total


def forecast_product(sku: str, horizon: int | None = None,
                     allowed: set | None = None) -> dict:
    horizon = int(horizon or config.FORECAST_HORIZON_DAYS)
    ctx = _product_ctx(sku)
    if ctx is None:
        return {"error": f"Unknown SKU {sku}"}

    y = monthly_series(sku)
    hist = [{"period": str(p), "label": p.strftime("%b %Y"), "units": float(v)}
            for p, v in y.items()]

    if y.empty or y.sum() == 0:
        return {**ctx, "horizon": horizon, "months_history": int(len(y)),
                "insufficient_history": True,
                "reason": "no sales history in the warehouse yet",
                "models": {}, "chosen": None, "best_fit_short": None,
                "forecast_30d": 0.0, "forecast_curve": [0.0] * horizon,
                "days_to_depletion": None, "coverage_gap": None,
                "stockout_risk": False, "history": hist}

    ev = evaluate_all(y, config.BACKTEST_MONTHS, config.MIN_MONTHS_HISTORY, allowed)
    best = ev["chosen"]
    curve, forecast_total = _daily_curve(y, best, horizon)
    forecast_30d = round(forecast_total * (30.0 / horizon), 2) if horizon != 30 else forecast_total
    per_day = forecast_total / horizon if forecast_total > 0 else 0.0
    dtd = round(ctx["stock_on_hand"] / per_day, 1) if per_day > 0 else None
    coverage_gap = ctx["stock_on_hand"] - round(forecast_30d)
    stockout_risk = (dtd is not None and dtd <= horizon) or coverage_gap < 0

    # attach short labels + chosen flag to each model row
    models = {}
    for name, m in ev["models"].items():
        models[name] = {**m, "short": SHORT.get(name, name),
                        "chosen": name == best}

    return {
        **ctx,
        "horizon": horizon,
        "months_history": int(len(y)),
        "observations_used": int((y > 0).sum()),
        "insufficient_history": ev["insufficient_history"],
        "models": models,
        "chosen": best,
        "best_fit_short": SHORT.get(best, best),
        "forecast_next_month": ev["forecast_next_month"],
        "forecast_30d": forecast_30d,
        "forecast_total_horizon": forecast_total,
        "forecast_curve": curve,
        "days_to_depletion": dtd,
        "coverage_gap": coverage_gap,
        "stockout_risk": bool(stockout_risk),
        "history": hist,
        "as_of": pd.Timestamp.today().strftime("%b %d, %Y"),
    }
