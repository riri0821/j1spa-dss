"""Central configuration. Values come from environment / .env (never hard-coded secrets)."""
import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def _bool(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


class Config:
    SECRET_KEY = os.getenv("FLASK_SECRET_KEY", "dev-only-not-secret")
    DEBUG = _bool("FLASK_DEBUG", "0")
    # Template auto-reload is normally tied to DEBUG, but DEBUG is kept off here even
    # during development (the app is reachable over the network / a future tailnet,
    # and Flask's debug mode serves full stack traces + an interactive debugger to
    # anyone who can reach it) - set independently so template edits still pick up
    # without a restart.
    TEMPLATES_AUTO_RELOAD = True
    # Explicit rather than relying on the browser's default SameSite behavior:
    # blocks the session cookie from being sent on cross-site requests (CSRF).
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_HTTPONLY = True

    DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
    DB_PORT = int(os.getenv("DB_PORT", "3306"))
    DB_USER = os.getenv("DB_USER", "j1spa_app")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "")
    OPS_DB = os.getenv("OPS_DB", "j1spa_ops")
    DW_DB = os.getenv("DW_DB", "j1spa_dw")

    MYSQL_BIN = os.getenv("MYSQL_BIN", r"C:/Program Files/MySQL/MySQL Server 8.0/bin")

    SCHEDULER_ENABLED = _bool("SCHEDULER_ENABLED", "true")
    INCREMENTAL_INTERVAL_MIN = int(os.getenv("INCREMENTAL_INTERVAL_MIN", "15"))
    RULES_INTERVAL_MIN = int(os.getenv("RULES_INTERVAL_MIN", "30"))
    BACKUP_HOUR = int(os.getenv("BACKUP_HOUR", "23"))
    BACKUP_MINUTE = int(os.getenv("BACKUP_MINUTE", "30"))
    BACKUP_KEEP = int(os.getenv("BACKUP_KEEP", "7"))

    HOST = os.getenv("HOST", "127.0.0.1")
    PORT = int(os.getenv("PORT", "5000"))

    BACKUP_DIR = BASE_DIR / "backups"
    HISTORICAL_DIR = BASE_DIR / "data" / "historical"

    # Forecasting / rules knobs (30-day horizon, ~24 months min history)
    FORECAST_HORIZON_DAYS = 30
    MIN_MONTHS_HISTORY = 24
    BACKTEST_MONTHS = 6
    SMA_WINDOW = 3
    WMA_WEIGHTS = (0.5, 0.333, 0.167)

    # Rule-based decision support thresholds
    SUPPLIER_LEAD_TIME_DAYS = 30
    SPIKE_THRESHOLD_PCT = 30.0
    OVERSTOCK_DOS_DAYS = 90

    # Data import
    MAX_UPLOAD_MB = 50

    def sqlalchemy_url(self, db_name: str) -> str:
        from urllib.parse import quote_plus
        pw = quote_plus(self.DB_PASSWORD)
        return (
            f"mysql+pymysql://{self.DB_USER}:{pw}@{self.DB_HOST}:{self.DB_PORT}/"
            f"{db_name}?charset=utf8mb4"
        )


config = Config()
