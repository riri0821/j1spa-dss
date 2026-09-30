"""FastAPI entrypoint. Kept as a standalone Python service (not ported to
Node) because the forecasting math (ARIMA, Holt-Winters, scikit-learn
linear regression) has no equivalent JS library with the same fidelity -
see the PERN migration plan. Only the Next.js backend calls this (with
FORECAST_SERVICE_KEY, never exposed to the browser), so it doesn't
duplicate the app's own login - it trusts whoever holds that key."""
import os
from fastapi import Depends, FastAPI, Header, HTTPException, Query

from service import forecast_product

INTERNAL_KEY = os.environ["FORECAST_SERVICE_KEY"]

app = FastAPI(title="J1SPA Forecasting Service")


def require_internal_key(x_internal_key: str = Header(default="")):
    if x_internal_key != INTERNAL_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Internal-Key.")


@app.get("/health")
def health():
    return {"ok": True}


SHORT_TO_FULL = {
    "MA": "Simple Moving Average", "WMA": "Weighted Moving Average",
    "Linear Regression": "Linear Regression", "ARIMA": "ARIMA",
    "Holt-Winters": "Holt-Winters",
}


@app.get("/forecast/{sku}", dependencies=[Depends(require_internal_key)])
def forecast(sku: str, horizon: int | None = Query(default=None), models: str | None = Query(default=None)):
    allowed = (
        {SHORT_TO_FULL[m] for m in models.split(",") if m in SHORT_TO_FULL}
        if models else None
    )
    result = forecast_product(sku, horizon=horizon, allowed=allowed)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result
