"""Start the locally hosted J1SPA DSS web app (Flask's built-in server).

    python run.py            # normal run
The scheduler (incremental ETL + rules + nightly backup) starts automatically
unless SCHEDULER_ENABLED=false in .env.
"""
from app import create_app
from config import config

app = create_app()

if __name__ == "__main__":
    # threaded so the on-demand Refresh / forecast calls don't block the UI
    app.run(host=config.HOST, port=config.PORT, debug=config.DEBUG,
            threaded=True, use_reloader=False)
