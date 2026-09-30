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


def linear_regression(y: pd.Series) -> float:
    """3.5.3 Linear Regression / linear equation model (trend line on time)."""
    from sklearn.linear_model import LinearRegression
    t = np.arange(len(y)).reshape(-1, 1)
    model = LinearRegression().fit(t, y.to_numpy(dtype=float))
    return _clip(float(model.predict([[len(y)]])[0]))


def arima_forecast(y: pd.Series, order=(1, 1, 1)) -> float:
    """3.5.4 ARIMA-based demand forecasting."""
    from statsmodels.tsa.arima.model import ARIMA
    fit = ARIMA(y.to_numpy(dtype=float), order=order).fit()
    return _clip(float(fit.forecast(1)[0]))


def holt_winters_forecast(y: pd.Series, seasonal_periods: int = 12) -> float:
    """3.5.5 Holt-Winters exponential smoothing (additive trend + seasonality
    when at least two full seasons are available, otherwise trend only)."""
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
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


def forecast_n(name: str, y: pd.Series, steps: int) -> list[float]:
    """Multi-step (monthly) forecast path for the chart's forecast segment."""
    if name in ("ARIMA", "Holt-Winters"):
        try:
            from statsmodels.tsa.arima.model import ARIMA
            from statsmodels.tsa.holtwinters import ExponentialSmoothing
            arr = y.to_numpy(dtype=float)
            if name == "ARIMA":
                fit = ARIMA(arr, order=(1, 1, 1)).fit()
            else:
                sp = 12 if len(y) >= 24 else None
                fit = ExponentialSmoothing(
                    arr, trend="add", seasonal="add" if sp else None,
                    seasonal_periods=sp, initialization_method="estimated").fit()
            return [_clip(v) for v in fit.forecast(steps)]
        except Exception:
            pass
    if name == "Linear Regression":
        from sklearn.linear_model import LinearRegression
        import numpy as _np
        t = _np.arange(len(y)).reshape(-1, 1)
        m = LinearRegression().fit(t, y.to_numpy(dtype=float))
        return [_clip(float(m.predict([[len(y) + i]])[0])) for i in range(steps)]
    # SMA / WMA -> flat next value
    fn = REGISTRY.get(name, (simple_moving_average, 0))[0]
    return [fn(y)] * steps
