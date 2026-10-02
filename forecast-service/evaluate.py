"""Forecast accuracy evaluation (paper 3.5.6): MSE (primary), plus RMSE and
MAPE as supporting metrics, via a rolling one-step backtest. The best model
per item is the one with the lowest MSE."""
from __future__ import annotations
import numpy as np
import pandas as pd

from models import REGISTRY


def _metrics(actual: np.ndarray, pred: np.ndarray) -> dict:
    err = actual - pred
    mse = float(np.mean(err ** 2))
    rmse = float(np.sqrt(mse))
    nonzero = actual != 0
    mape = (float(np.mean(np.abs(err[nonzero] / actual[nonzero]))) * 100.0
            if nonzero.any() else None)
    return {"mse": round(mse, 4), "rmse": round(rmse, 4),
            "mape": round(mape, 2) if mape is not None else None}


def rolling_backtest(y: pd.Series, model_fn, k: int) -> dict | None:
    """Fit on an expanding window, predict the next point, for the last k points."""
    if len(y) <= k + 2:
        k = max(1, len(y) - 3)
    actuals, preds = [], []
    for i in range(len(y) - k, len(y)):
        train = y.iloc[:i]
        try:
            preds.append(model_fn(train))
            actuals.append(float(y.iloc[i]))
        except Exception:
            return None
    if not preds:
        return None
    return _metrics(np.array(actuals), np.array(preds))


def candidate_names(y: pd.Series, min_months_history: int, allowed: set | None) -> tuple[list[str], bool]:
    """Which of the five models apply, and whether history is too short for
    a real comparison (in which case only Simple Moving Average runs)."""
    if len(y) < min_months_history:
        return ["Simple Moving Average"], True
    names = list(REGISTRY.keys())
    if allowed:
        filtered = [n for n in names if n in allowed]
        if filtered:                             # else: user unticked everything
            names = filtered
    return names, False


def evaluate_one(y: pd.Series, name: str, backtest_months: int) -> dict | None:
    """Backtest + next-month forecast for a single named model, or None if
    there isn't enough history or the fit fails. Split out from evaluate_all
    so callers can cache per model instead of per model-combination."""
    fn, min_obs = REGISTRY[name]
    if len(y) < min_obs:
        return None
    m = rolling_backtest(y, fn, backtest_months)
    if m is None:
        return None
    try:
        m["next"] = fn(y)
    except Exception:
        return None
    return m


def evaluate_all(y: pd.Series, backtest_months: int = 6,
                 min_months_history: int = 24, allowed: set | None = None) -> dict:
    """Return per-model metrics + the next-month forecast, and the chosen model.

    `allowed` (full model names) restricts which of the five candidates are
    compared; None means all. If history is shorter than `min_months_history`,
    only Simple Moving Average is considered and the result is flagged."""
    names, insufficient = candidate_names(y, min_months_history, allowed)
    results: dict[str, dict] = {}
    for name in names:
        m = evaluate_one(y, name, backtest_months)
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
