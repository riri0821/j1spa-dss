"""Forecasting workspace service: pull an item's monthly demand history,
run the five-model comparison, and translate the winning forecast into a
30-day demand figure, a forward daily curve for the chart, and a
days-to-depletion / coverage-gap estimate (paper 3.5 / 3.10.3).

Adapted from app/forecast/service.py:
  - monthly_series() now calls the monthly_demand() Postgres function
    (sql/supabase_phase3_forecast_function.sql) instead of joining the old
    MySQL warehouse's fact_transactions/dim_date/dim_product star schema,
    which no longer exists in the Postgres migration.
  - _daily_curve() takes an already-computed multi-step forecast instead
    of fitting the model itself - forecast_product() now fits ARIMA/
    Holt-Winters once per request and reuses it for both the chart curve
    and the monthly table, instead of fitting the same model twice.
  - Added the fingerprint-keyed model cache below (ARIMA/Holt-Winters fits
    are the slow part of a run, and toggling the model-comparison pills or
    re-opening a SKU was refitting everything from scratch every time)."""
from __future__ import annotations
from functools import lru_cache
import pandas as pd

from config import config
from db import supabase
from evaluate import evaluate_one, candidate_names
from models import forecast_n, SHORT


def _fingerprint(y: pd.Series) -> tuple:
    """Hashable snapshot of a monthly series' actual content (period + value
    pairs), used as the cache key below. A cache hit is only possible when
    this exact sales history comes back unchanged, so the cache can never
    serve a stale result - it busts itself the moment new data lands, with
    no TTL or manual invalidation to get wrong. Values are kept at full
    float precision (not rounded) since the reconstructed series is what
    actually gets re-fit - rounding here would silently perturb the ARIMA/
    Holt-Winters optimizers' inputs."""
    return tuple((str(p), float(v)) for p, v in y.items())


def _series_from_fingerprint(fp: tuple) -> pd.Series:
    idx = pd.PeriodIndex([p for p, _ in fp], freq="M")
    return pd.Series([v for _, v in fp], index=idx)


@lru_cache(maxsize=1024)
def _evaluate_one_cached(fp: tuple, backtest_months: int, name: str) -> dict | None:
    return evaluate_one(_series_from_fingerprint(fp), name, backtest_months)


def _evaluate_all_cached(fp: tuple, backtest_months: int,
                         min_months_history: int, allowed_key: tuple | None) -> dict:
    """Same contract as evaluate.evaluate_all(), but cached per model rather
    than per model-combination: flipping a model-comparison pill reuses every
    already-fit model instead of redoing the whole comparison. Fit
    sequentially, not in threads - these are CPU-bound numpy/statsmodels fits
    held under the GIL, not I/O, so extra threads just add context-switching
    overhead on top of Render's single shared vCPU instead of any real
    parallelism."""
    y = _series_from_fingerprint(fp)
    allowed = set(allowed_key) if allowed_key else None
    names, insufficient = candidate_names(y, min_months_history, allowed)

    results = {}
    for name in names:
        m = _evaluate_one_cached(fp, backtest_months, name)
        if m is not None:
            results[name] = m

    if not results:
        return {"insufficient_history": True, "models": {}, "chosen": None,
                "forecast_next_month": 0.0}

    chosen = min(results.items(), key=lambda kv: kv[1]["mse"])[0]
    return {
        "insufficient_history": insufficient,
        "models": results,
        "chosen": chosen,
        "forecast_next_month": results[chosen]["next"],
    }


@lru_cache(maxsize=256)
def _forecast_n_cached(fp: tuple, best: str, n_months: int) -> tuple[float, ...]:
    y = _series_from_fingerprint(fp)
    return tuple(forecast_n(best, y, n_months))


def monthly_series(sku: str) -> pd.Series:
    """Gap-free monthly unit-demand series for one SKU."""
    resp = supabase.rpc("monthly_demand", {"p_sku": sku}).execute()
    rows = resp.data or []
    if not rows:
        return pd.Series(dtype=float)
    idx = pd.PeriodIndex(
        [pd.Period(year=r["year"], month=r["month"], freq="M") for r in rows], freq="M")
    s = pd.Series([float(r["units"]) for r in rows], index=idx)
    full = pd.period_range(s.index.min(), s.index.max(), freq="M")
    return s.reindex(full, fill_value=0.0)


def _product_ctx(sku: str) -> dict | None:
    resp = (
        supabase.table("products")
        .select("product_id, sku, name, stock_on_hand, reorder_point, unit_cost, unit_price")
        .eq("sku", sku)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        return None
    r = rows[0]
    return {"product_id": r["product_id"], "sku": r["sku"], "name": r["name"],
            "stock_on_hand": r["stock_on_hand"], "reorder_point": r["reorder_point"],
            "unit_cost": float(r["unit_cost"]), "unit_price": float(r["unit_price"])}


def _daily_curve(y: pd.Series, path_months: list[float], horizon: int) -> tuple[list[float], float]:
    """A smooth day-by-day demand path for the chart's forecast segment.
    Ramps from the last observed daily rate toward the model's next-month
    rate, extended with the second month if the horizon needs it.
    `path_months` must already cover enough months (see forecast_product)."""
    last_month_units = float(y.iloc[-1]) if len(y) else path_months[0]
    start_rate = last_month_units / 30.0
    curve = []
    for d in range(1, horizon + 1):
        mo = (d - 1) // 30
        target_rate = path_months[min(mo, len(path_months) - 1)] / 30.0
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
                "reason": "no confirmed sales history yet",
                "models": {}, "chosen": None, "best_fit_short": None,
                "forecast_30d": 0.0, "forecast_curve": [0.0] * horizon,
                "forecast_monthly": [],
                "days_to_depletion": None, "coverage_gap": None,
                "stockout_risk": False, "history": hist}

    fp = _fingerprint(y)
    allowed_key = tuple(sorted(allowed)) if allowed else None
    ev = _evaluate_all_cached(fp, config.BACKTEST_MONTHS, config.MIN_MONTHS_HISTORY, allowed_key)
    best = ev["chosen"]

    # One multi-step fit covers both the chart's daily ramp (which needs
    # one extra month for interpolation across a month boundary) and the
    # monthly forecast table below - fitting ARIMA/Holt-Winters a second
    # time for the same series was wasted work in the original version.
    n_months = max(1, -(-horizon // 30))  # ceil(horizon / 30)
    path_months = list(_forecast_n_cached(fp, best, n_months + 1))

    curve, forecast_total = _daily_curve(y, path_months, horizon)
    forecast_30d = round(forecast_total * (30.0 / horizon), 2) if horizon != 30 else forecast_total

    future_idx = pd.period_range(y.index[-1] + 1, periods=n_months, freq="M")
    forecast_monthly = [{"period": str(p), "label": p.strftime("%b %Y"), "units": round(v, 2)}
                        for p, v in zip(future_idx, path_months[:n_months])]
    per_day = forecast_total / horizon if forecast_total > 0 else 0.0
    dtd = round(ctx["stock_on_hand"] / per_day, 1) if per_day > 0 else None
    coverage_gap = ctx["stock_on_hand"] - round(forecast_30d)
    stockout_risk = (dtd is not None and dtd <= horizon) or coverage_gap < 0

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
        "forecast_monthly": forecast_monthly,
        "days_to_depletion": dtd,
        "coverage_gap": coverage_gap,
        "stockout_risk": bool(stockout_risk),
        "history": hist,
        "as_of": pd.Timestamp.today().strftime("%b %d, %Y"),
    }
