"""Rule-based decision support (paper 3.6).

Deterministic conditions evaluated against *current* stock balances maintained
by the system (not an imported snapshot). Output is advisory only - the owner
keeps the decision. Three advisory types, each with a numbered rule trace:

    Low stock alert     R-01 stock <= ROP ; R-02 forecast_30d > on_hand ;
                        R-03 days_to_depletion < lead_time
    Demand spike        R-04 forecast_30d > avg_12w ;
                        R-05 deviation_pct > threshold
    Overstock advisory  R-07 on_hand > ROP x 3 ; R-08 velocity = Slow-Moving ;
                        R-09 days_of_supply > 90
"""
from __future__ import annotations
import math
from datetime import datetime
from statistics import median
from sqlalchemy import text

from config import config
from ..db import ops_engine, dw_engine
from ..forecast.service import monthly_series
from ..forecast.models import simple_moving_average

LEAD = config.SUPPLIER_LEAD_TIME_DAYS
SPIKE = config.SPIKE_THRESHOLD_PCT
DOS_MAX = config.OVERSTOCK_DOS_DAYS


def _velocity_map() -> tuple[dict, float]:
    with dw_engine.begin() as dc:
        rows = dc.execute(text(
            "SELECT sku, units_90d FROM vw_product_velocity")).all()
    m = {r[0]: float(r[1] or 0) for r in rows}
    nz = [v for v in m.values() if v > 0]
    return m, (median(nz) if nz else 0.0)


def _fc(sku: str):
    """(forecast_30d, avg_12w) using a light SMA(3) on the monthly series."""
    y = monthly_series(sku)
    if y.empty or y.sum() == 0:
        return 0.0, 0.0
    fc = round(simple_moving_average(y, 3), 2)
    avg12 = round(float(y.iloc[-4:-1].mean()) if len(y) >= 4
                  else float(y.iloc[:-1].mean() or 0), 2)
    return fc, avg12


def evaluate_all(persist: bool = True) -> dict:
    batch_id = datetime.now().strftime("%Y%m%d%H%M%S")
    vmap, vmed = _velocity_map()

    with ops_engine.begin() as oc:
        products = oc.execute(text("""
            SELECT product_id, sku, name, stock_on_hand, reorder_point
            FROM products WHERE is_active = 1
        """)).all()

    advisories: list[dict] = []
    for pid, sku, name, soh, rop in products:
        fc30, avg12 = _fc(sku)
        per_day = fc30 / 30.0 if fc30 > 0 else 0.0
        dtd = round(soh / per_day, 1) if per_day > 0 else math.inf
        dos = dtd
        dev = round((fc30 - avg12) / avg12 * 100, 1) if avg12 > 0 else 0.0
        vel = "Slow-Moving" if vmap.get(sku, 0.0) <= vmed else "Fast-Moving"

        # ---------- Low stock alert ----------
        r01 = soh <= rop
        r02 = fc30 > soh
        r03 = dtd < LEAD
        if r01:
            advisories.append(_adv(
                pid, sku, name, "low_stock", "critical", "Low Stock Alert",
                f"Current stock ({soh}), reorder point ({rop}). "
                f"Forecasted 30-day demand: {round(fc30)} units.",
                "Reorder immediately", soh, rop, fc30, dtd,
                [("R-01", f"stock ({soh}) ≤ ROP ({rop})", r01),
                 ("R-02", f"forecast_30d ({round(fc30)}) > on_hand ({soh})", r02),
                 ("R-03", f"days_to_depletion ({_fmt(dtd)}) < lead_time ({LEAD})", r03)]))
            continue

        # ---------- Demand spike warning ----------
        r04 = fc30 > avg12 and avg12 > 0
        r05 = dev > SPIKE
        if r04 and r05:
            advisories.append(_adv(
                pid, sku, name, "demand_spike", "warning", "Demand Spike Warning",
                f"30-day forecast ({round(fc30)} units), 12-week average "
                f"({round(avg12)} units), up {dev:.1f}%.",
                "Monitor demand spike", soh, rop, fc30, dtd,
                [("R-04", f"forecast_30d ({round(fc30)}) > avg_12w ({round(avg12)})", r04),
                 ("R-05", f"deviation_pct ({dev:.1f}%) > threshold ({SPIKE:.0f}%)", r05)]))
            continue

        # ---------- Overstock advisory ----------
        r07 = rop > 0 and soh > rop * 3
        r08 = vel == "Slow-Moving"
        r09 = dos > DOS_MAX
        if r07 and (r08 or r09):
            advisories.append(_adv(
                pid, sku, name, "overstock", "warning", "Overstock Advisory",
                f"Current balance of {soh} units with low recent sales.",
                "Consider markdown", soh, rop, fc30, dtd,
                [("R-07", f"on_hand ({soh}) > ROP×3 ({rop * 3})", r07),
                 ("R-08", 'velocity_class = "Slow-Moving"', r08),
                 ("R-09", f"days_of_supply ({_fmt(dos)}) > {DOS_MAX}", r09)]))

    if persist and advisories:
        with ops_engine.begin() as oc:
            for a in advisories:
                oc.execute(text("""
                    INSERT INTO alerts (batch_id, product_id, sku, product_name,
                        alert_type, severity, stock_on_hand, reorder_point,
                        forecast_30d, days_to_depletion, recommendation, rule_trace)
                    VALUES (:b,:pid,:sku,:name,:type,:sev,:soh,:rop,:fc,:dtd,:rec,:trace)
                """), {"b": batch_id, "pid": a["product_id"], "sku": a["sku"],
                       "name": a["name"], "type": a["type"], "sev": a["severity"],
                       "soh": a["on_hand"], "rop": a["rop"], "fc": a["forecast_30d"],
                       "dtd": None if a["days_to_depletion"] is None else a["days_to_depletion"],
                       "rec": a["recommendation"],
                       "trace": "; ".join(f"{r['id']} {r['expr']} -> "
                                          f"{'TRUE' if r['result'] else 'FALSE'}"
                                          for r in a["rules"])[:255]})

    by_type: dict[str, int] = {}
    for a in advisories:
        by_type[a["type"]] = by_type.get(a["type"], 0) + 1

    summary = [{
        "sku": a["sku"], "name": a["name"], "on_hand": a["on_hand"],
        "rop": a["rop"], "forecast_30d": round(a["forecast_30d"]),
        "days_to_depletion": a["days_to_depletion"],
        "recommendation": a["recommendation"], "severity": a["severity"],
    } for a in advisories]

    return {"batch_id": batch_id,
            "generated_at": datetime.now().strftime("%b %d, %Y %H:%M"),
            "count": len(advisories), "by_type": by_type,
            "advisories": advisories, "summary": summary}


def _fmt(x) -> str:
    return "∞" if x == math.inf else str(round(x))


def _adv(pid, sku, name, atype, sev, title, message, rec, soh, rop, fc, dtd, rules):
    return {
        "product_id": pid, "sku": sku, "name": name, "type": atype,
        "severity": sev, "title": title, "message": message,
        "recommendation": rec, "on_hand": soh, "rop": rop,
        "forecast_30d": fc,
        "days_to_depletion": None if dtd == math.inf else dtd,
        "rules": [{"id": rid, "expr": expr, "result": bool(res)}
                  for rid, expr, res in rules],
    }


def latest_batch() -> dict:
    """Recompute live (advisories are cheap) so the screen always reflects
    current stock balances."""
    return evaluate_all(persist=True)
