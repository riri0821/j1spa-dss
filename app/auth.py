from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_login import login_user, logout_user, login_required

from .security import authenticate, seconds_locked_out, record_failed_login, clear_failed_logins

bp = Blueprint("auth", __name__)


def _safe_next(url: str | None) -> str | None:
    """Only follow `next` if it's a same-site path - a bare URL would let
    /login?next=https://evil.example redirect a successful login off-site."""
    if url and url.startswith("/") and not url.startswith("//"):
        return url
    return None


@bp.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username", "")
        wait = seconds_locked_out(username)
        if wait:
            flash(f"Too many failed attempts. Try again in {wait}s.", "error")
        else:
            user = authenticate(username, request.form.get("password", ""))
            if user:
                clear_failed_logins(username)
                login_user(user)
                # role decides the landing screen (paper 1.5.1 / 3.10.1)
                dest = "analytics.dashboard" if user.is_owner else "sales.screen"
                return redirect(_safe_next(request.args.get("next")) or url_for(dest))
            record_failed_login(username)
            flash("Invalid username or password.", "error")
    return render_template("login.html")


@bp.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("auth.login"))
