"""Decision Support Advisories (owner only, paper 3.6 / 3.9.3). Shows the
current rule-based advisory set with its rule-condition audit. Advisory only:
the system performs no autonomous procurement or ledger changes."""
from flask import Blueprint, render_template, jsonify
from flask_login import login_required

from .security import owner_only
from .rules import engine

bp = Blueprint("alerts", __name__, url_prefix="/alerts")


@bp.route("/")
@login_required
@owner_only
def screen():
    return render_template("alerts.html")


@bp.route("/api/latest")
@login_required
@owner_only
def api_latest():
    return jsonify(engine.evaluate_all(persist=True))


@bp.route("/api/recompute", methods=["POST"])
@login_required
@owner_only
def api_recompute():
    return jsonify(engine.evaluate_all(persist=True))
