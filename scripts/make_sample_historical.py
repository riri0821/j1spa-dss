"""Generate sample legacy files for the one-time historical import so the
warehouse, forecasting and rules have data to work with during development
and the defense demo.

Writes:
    data/historical/product_catalog.csv
    data/historical/sales_records.csv   (deliberately a bit messy: variant
        names, mixed date formats, a few missing dates and duplicate rows,
        so the DCR / DRR metrics show realistic values)

    python scripts/make_sample_historical.py --skus 40 --years 5
"""
from __future__ import annotations
import argparse
import csv
import random
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "historical"

CATEGORIES = ["Engine Oil", "Filters", "Brake Parts", "Drive Train",
              "Electrical", "Tires & Tubes", "Bearings", "Body & Accessories"]
BRANDS = ["NGK", "Denso", "Motul", "Bendix", "KYB", "Yuasa", "Aspira", "Generic"]
SUPPLIERS = ["Metro Parts Trading", "Speedline Distribution", "QC Moto Supply"]
NAME_BITS = ["Spark Plug", "Oil Filter", "Air Filter", "Front Brake Pad Set",
             "Rear Brake Shoe", "Drive Belt", "Roller Weight Set", "CDI Unit",
             "Ignition Coil", "Battery 12V", "Inner Tube", "Ball Bearing 6301",
             "Clutch Bell", "Fork Oil Seal", "Chain 428H", "Sprocket 42T",
             "Headlight Bulb", "Horn 12V", "Fuel Cock", "Throttle Cable"]


def messy_name(clean: str) -> str:
    r = random.random()
    if r < 0.15:
        return clean.lower()
    if r < 0.25:
        return clean.upper()
    if r < 0.35:
        return "  " + clean + "  "
    if r < 0.42:
        return clean.replace(" ", "  ")
    return clean


def fmt_date(d: date) -> str:
    return random.choice([
        d.isoformat(),
        d.strftime("%m/%d/%Y"),
        d.strftime("%d-%b-%Y"),
        d.strftime("%Y/%m/%d"),
    ])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--skus", type=int, default=40)
    ap.add_argument("--years", type=int, default=5)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()
    random.seed(args.seed)
    OUT.mkdir(parents=True, exist_ok=True)

    # ---------------- catalog ----------------
    products = []
    for i in range(1, args.skus + 1):
        base = random.choice(NAME_BITS)
        brand = random.choice(BRANDS)
        cost = round(random.uniform(35, 900), 2)
        price = round(cost * random.uniform(1.25, 1.9), 2)
        products.append({
            "sku": f"J1-{i:04d}",
            "name": f"{base} {brand}",
            "category": random.choice(CATEGORIES),
            "brand": brand,
            "supplier": random.choice(SUPPLIERS),
            "vehicle_compat": random.choice(["Universal", "Honda Beat", "Yamaha Mio",
                                             "Suzuki Raider", "Honda Click"]),
            "unit_cost": cost,
            "unit_price": price,
            "reorder_point": random.choice([10, 15, 20, 25, 30, 40, 50]),
            "opening_stock": random.randint(0, 120),
            "base_demand": random.choice([2, 4, 6, 8, 12, 18, 25, 40]),
            "trend": random.uniform(-0.03, 0.06),
            "season_amp": random.uniform(0.0, 0.5),
        })

    with open(OUT / "product_catalog.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["sku", "name", "category", "brand", "supplier",
                    "vehicle_compat", "unit_cost", "unit_price",
                    "reorder_point", "opening_stock"])
        for p in products:
            w.writerow([p["sku"], p["name"], p["category"], p["brand"], p["supplier"],
                        p["vehicle_compat"], p["unit_cost"], p["unit_price"],
                        p["reorder_point"], p["opening_stock"]])

    # ---------------- sales history ----------------
    end = date.today().replace(day=1) - timedelta(days=1)
    start = date(end.year - args.years, end.month, 1)
    rows = []
    month = start
    m_index = 0
    while month <= end:
        for p in products:
            level = p["base_demand"] * ((1 + p["trend"]) ** m_index)
            seasonal = 1 + p["season_amp"] * (
                1 if month.month in (5, 6, 11, 12) else
                -0.6 if month.month in (1, 2) else 0)
            monthly_units = max(0, int(random.gauss(level * seasonal, level * 0.3)))
            # spread the month's units across a handful of sale days
            days = random.randint(1, min(12, max(1, monthly_units)))
            for _ in range(days):
                qty = max(1, monthly_units // days)
                sale_day = month + timedelta(days=random.randint(0, 27))
                price_noise = round(p["unit_price"] * random.uniform(0.97, 1.03), 2)
                rows.append([fmt_date(sale_day), p["sku"], qty,
                             price_noise, p["unit_cost"]])
        month = date(month.year + (month.month // 12), (month.month % 12) + 1, 1)
        m_index += 1

    # inject noise: ~2% missing dates, ~1.5% duplicate rows
    for _ in range(int(len(rows) * 0.02)):
        rows[random.randrange(len(rows))][0] = ""
    dupes = [list(rows[random.randrange(len(rows))]) for _ in range(int(len(rows) * 0.015))]
    rows.extend(dupes)
    random.shuffle(rows)

    with open(OUT / "sales_records.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["date", "sku", "quantity", "unit_price", "unit_cost"])
        w.writerows(rows)

    print(f"wrote {OUT/'product_catalog.csv'} ({len(products)} products)")
    print(f"wrote {OUT/'sales_records.csv'} ({len(rows)} rows, {start} .. {end})")


if __name__ == "__main__":
    main()
