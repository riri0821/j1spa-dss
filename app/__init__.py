"""Application factory. Wires config, login/RBAC, blueprints and the
background scheduler for the locally hosted J1SPA DSS web app."""
import logging
from flask import Flask, redirect, url_for
from flask_login import LoginManager, current_user

from config import config as app_config
from .security import load_user

login_manager = LoginManager()
login_manager.login_view = "auth.login"


def create_app() -> Flask:
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    app = Flask(__name__)
    app.config.from_object(app_config)
    app.config["MAX_CONTENT_LENGTH"] = app_config.MAX_UPLOAD_MB * 1024 * 1024

    login_manager.init_app(app)

    @login_manager.user_loader
    def _loader(user_id):
        return load_user(user_id)

    from .auth import bp as auth_bp
    from .main import bp as main_bp
    from .sales import bp as sales_bp
    from .stockin import bp as stockin_bp
    from .products import bp as products_bp
    from .analytics import bp as analytics_bp
    from .forecasting_bp import bp as forecasting_bp
    from .alerts_bp import bp as alerts_bp
    from .imports_bp import bp as imports_bp
    from .settings_bp import bp as settings_bp

    for bp in (auth_bp, main_bp, sales_bp, stockin_bp, products_bp,
               analytics_bp, forecasting_bp, alerts_bp, imports_bp, settings_bp):
        app.register_blueprint(bp)

    import os as _os
    _static_dir = _os.path.join(_os.path.dirname(__file__), "static")

    @app.context_processor
    def _nav():
        try:
            v = int(max(_os.path.getmtime(_os.path.join(_static_dir, f))
                        for f in ("app.css", "app.js")))
        except OSError:
            v = 0
        return {"nav_role": getattr(current_user, "role", None),
                "app_name": "J1SPA Analytics", "static_v": v}

    @app.route("/health")
    def health():
        return {"status": "ok"}

    if app.config.get("SCHEDULER_ENABLED"):
        from .scheduler import start
        start()

    return app
