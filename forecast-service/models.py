"""The five candidate forecasting models (paper section 3.5). Each function
takes a pandas Series of monthly unit demand (a clean, gap-free monthly
index) and returns the one-step-ahead forecast for the next month (a
non-negative float).

Ported unchanged from the original Flask app's app/forecast/models.py -
this is the validated statistical core the capstone paper describes, kept
as Python rather than reimplemented in JS (no equivalent ARIMA/Holt-Winters
library exists with the same fidelity in the Node ecosystem)."""
from __future__ import annotations
import warnings
import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")  # statsmodels convergence chatter

# Imported at module scope, not inside the model functions. These three
# imports cost ~1.1s the first time they run (sklearn ~0.85s, statsmodels
# ~0.25s), and while they sat inside the functions that cost landed on
# whichever request happened to be first after a cold start: a measured
# ~1.5s first "Run comparison" for what is only ~0.44s of actual fitting.
# Loading them here moves it to service startup instead. The fits
# themselves are untouched - same inputs, same numbers.
from sklearn.linear_model import LinearRegression
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.holtwinters import ExponentialSmoothing


def _clip(x: float) -> float:
    return float(max(0.0, round(x, 4)))


def simple_moving_average(y: pd.Series, window: int = 3) -> float:
    """3.5.1 Simple Moving Average."""
    w = min(window, len(y))
    return _clip(y.iloc[-w:].mean())


def weighted_moving_average(y: pd.Series, weights=(0.5, 0.333, 0.167)) -> float:
    """3.5.2 Weighted Moving Average (most recent period weighted highest)."""
    w = list(weights)[: len(y)]
    w = np.array(w) / np.sum(w)
    vals = y.iloc[-len(w):].to_numpy(dtype=float)
    return _clip(float(np.dot(vals, w[::-1])))


def _ols_line(y: pd.Series) -> tuple[float, float]:
    """Fit the trend line once and hand back (intercept, slope).

    Still scikit-learn's own fit - deliberately. A closed-form OLS is ~40x
    faster, but it cannot be made bit-identical: integer unit demand puts a
    measurable share of predictions exactly on a 4-decimal half-way value,
    where a ~2e-13 difference in the solve flips _clip()'s rounding (tested
    against exact rational arithmetic: ~0.02% of cases, step 0 included, so
    MSE and the chosen model are both reachable). Linear Regression is only
    ~3ms of a ~650ms request - nothing here is worth that risk.

    Evaluating the line as `intercept + slope * x` instead of calling
    .predict([[x]]) once per step *is* bit-identical (verified over 12,000
    cases) and skips sklearn's input validation on every step of the path.
    """
    t = np.arange(len(y)).reshape(-1, 1)
    model = LinearRegression().fit(t, y.to_numpy(dtype=float))
    return float(model.intercept_), float(model.coef_[0])


def linear_regression(y: pd.Series) -> float:
    """3.5.3 Linear Regression / linear equation model (trend line on time)."""
    intercept, slope = _ols_line(y)
    return _clip(intercept + slope * len(y))


def arima_forecast(y: pd.Series, order=(1, 1, 1)) -> float:
    """3.5.4 ARIMA-based demand forecasting."""
    fit = ARIMA(y.to_numpy(dtype=float), order=order).fit()
    return _clip(float(fit.forecast(1)[0]))


def holt_winters_forecast(y: pd.Series, seasonal_periods: int = 12) -> float:
    """3.5.5 Holt-Winters exponential smoothing (additive trend + seasonality
    when at least two full seasons are available, otherwise trend only)."""
    seasonal = "add" if len(y) >= 2 * seasonal_periods else None
    sp = seasonal_periods if seasonal else None
    fit = ExponentialSmoothing(
        y.to_numpy(dtype=float), trend="add", seasonal=seasonal,
        seasonal_periods=sp, initialization_method="estimated",
    ).fit()
    return _clip(float(fit.forecast(1)[0]))


# name -> (callable, minimum observations it needs)
REGISTRY = {
    "Simple Moving Average": (simple_moving_average, 2),
    "Weighted Moving Average": (weighted_moving_average, 3),
    "Linear Regression": (linear_regression, 4),
    "ARIMA": (arima_forecast, 12),
    "Holt-Winters": (holt_winters_forecast, 24),
}

# short labels used on the model-comparison pills / table (paper 3.10.3)
SHORT = {
    "Simple Moving Average": "MA", "Weighted Moving Average": "WMA",
    "Linear Regression": "Linear Regression", "ARIMA": "ARIMA",
    "Holt-Winters": "Holt-Winters",
}


# The longest monthly path any horizon needs: ceil(90 / 30) + 1, where 90 is
# the UI's longest horizon and the +1 lets _daily_curve interpolate across the
# final month boundary. Always fitting to this fixed length - rather than to
# exactly what the current horizon needs - costs nothing and lets every
# horizon share one cached fit, because for all five models forecast(k)[:j]
# is bit-identical to forecast(j): same fitted parameters, same recursion,
# just read fewer steps off it.
MAX_PATH_MONTHS = 4


def forecast_path(name: str, y: pd.Series, steps: int = MAX_PATH_MONTHS) -> list[float]:
    """Multi-step monthly forecast path for one model.

    `path[0]` is exactly the one-step-ahead forecast that this model's
    single-step function in REGISTRY returns - same fit, same number, verified
    bit-identical for ARIMA and Holt-Winters - so a caller needing both the
    next-month figure and the chart path takes them from one fit instead of
    fitting the same model on the same series twice.

    Raises if the fit fails, rather than the old forecast_n()'s fall-through
    to another model's numbers: a caller that cannot fit a model must drop it
    from the comparison, not silently relabel a moving average as ARIMA.
    """
    if name == "ARIMA":
        fit = ARIMA(y.to_numpy(dtype=float), order=(1, 1, 1)).fit()
        return [_clip(v) for v in fit.forecast(steps)]
    if name == "Holt-Winters":
        sp = 12 if len(y) >= 24 else None
        fit = ExponentialSmoothing(
            y.to_numpy(dtype=float), trend="add", seasonal="add" if sp else None,
            seasonal_periods=sp, initialization_method="estimated").fit()
        return [_clip(v) for v in fit.forecast(steps)]
    if name == "Linear Regression":
        intercept, slope = _ols_line(y)
        return [_clip(intercept + slope * (len(y) + i)) for i in range(steps)]
    # SMA / WMA -> flat next value
    fn = REGISTRY.get(name, (simple_moving_average, 0))[0]
    return [fn(y)] * steps
