"""Small subset of the original app's config.py - just the forecasting
knobs this service actually needs."""
import os


class Config:
    FORECAST_HORIZON_DAYS = int(os.getenv("FORECAST_HORIZON_DAYS", "30"))
    MIN_MONTHS_HISTORY = int(os.getenv("MIN_MONTHS_HISTORY", "24"))
    BACKTEST_MONTHS = int(os.getenv("BACKTEST_MONTHS", "6"))


config = Config()
