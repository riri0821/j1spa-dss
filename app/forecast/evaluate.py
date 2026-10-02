"""Forecast accuracy evaluation (paper 3.5.6): MSE (primary), plus RMSE and
MAPE as supporting metrics, via a rolling one-step backtest. The best model
per item is the one with the lowest MSE."""
from __future__ import annotations
import numpy as np
import pandas as pd

from .models import REGISTRY


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


def evaluate_all(y: pd.Series, backtest_months: int = 6,
                 min_months_history: int = 24, allowed: set | None = None) -> dict:
    """Return per-model metrics + the next-month forecast, and the chosen model.

    `allowed` (full model names) restricts which of the five candidates are
    compared; None means all. If history is shorter than `min_months_history`,
    only Simple Moving Average is considered and the result is flagged."""
    insufficient = len(y) < min_months_history
    results: dict[str, dict] = {}

    candidates = list(REGISTRY.items())
    if insufficient:
        candidates = [(n, v) for n, v in REGISTRY.items()
                      if n == "Simple Moving Average"]
    elif allowed:
        candidates = [(n, v) for n, v in candidates if n in allowed]
        if not candidates:                       # user unticked everything
            candidates = list(REGISTRY.items())

    for name, (fn, min_obs) in candidates:
        if len(y) < min_obs:
            continue
        m = rolling_backtest(y, fn, backtest_months)
        if m is None:
            continue
        try:
            m["next"] = fn(y)
        except Exception:
            continue
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
