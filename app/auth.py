from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_login import login_user, logout_user, login_required

from .security import authenticate

bp = Blueprint("auth", __name__)


@bp.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        user = authenticate(request.form.get("username", ""),
                            request.form.get("password", ""))
        if user:
            login_user(user)
            # role decides the landing screen (paper 1.5.1 / 3.10.1)
            dest = "analytics.dashboard" if user.is_owner else "sales.screen"
            return redirect(request.args.get("next") or url_for(dest))
        flash("Invalid username or password.", "error")
    return render_template("login.html")


@bp.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("auth.login"))
