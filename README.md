# J1SPA — Data-Driven Business Analytics & Predictive Decision Support System

Locally hosted web application for **J1 Scooter Parts and Accessories**. Implements
the capstone design: direct sales entry → operational MySQL database → internal
Python ETL → MySQL star-schema warehouse → descriptive/diagnostic dashboards,
five-model 30-day forecasting, and a rule-based decision-support layer. All
dashboards are built into the app — there is one interface for the owner.

No internet or cloud service is required at run time.

---

## 1. Prerequisites (already prepared on this machine)

| Component | Status |
|---|---|
| Python 3.14 (`scoop install python`) | ✅ installed |
| MySQL 8.0 Server (`MySQL80` service) | ✅ running |
| Python packages (`requirements.txt`) | ✅ installed into `.venv` |

The virtual environment lives in `.venv`. Run everything with
`./.venv/Scripts/python.exe` (Git Bash) or `.venv\Scripts\python.exe` (PowerShell).

---

## 2. First-time setup

```powershell
cd C:\Users\user\desktop\j1spa-dss

# 2.1  Create databases + app user + .env  (use your MySQL root password)
.venv\Scripts\python.exe scripts\bootstrap_db.py --admin-user root --admin-password "YOUR_ROOT_PW" --drop

# 2.2  Create the owner login (you will be prompted for a password)
.venv\Scripts\python.exe scripts\create_admin.py --username owner --name "Store Owner" --role owner

# 2.3  (demo data) a staff login + a few live products
.venv\Scripts\python.exe scripts\seed_sample_ops.py

# 2.4  (demo data) generate sample legacy files, then run the one-time historical import
.venv\Scripts\python.exe scripts\make_sample_historical.py --skus 40 --years 5
.venv\Scripts\python.exe scripts\run_historical_import.py
```

For the **real** deployment, skip 2.3–2.4 and instead drop the store's real
`product_catalog.csv/xlsx` and `sales_records.csv/xlsx` into
`data/historical/`, then run `run_historical_import.py` once.

Expected columns (aliases are auto-detected):

* **product_catalog** — `sku, name, category, brand, supplier, vehicle_compat, unit_cost, unit_price, reorder_point, opening_stock`
* **sales_records** — `date, sku, quantity, unit_price, unit_cost` (price/cost optional; backfilled from the catalog)

---

## 3. Run

```powershell
.venv\Scripts\python.exe run.py
```

Open <http://127.0.0.1:5000>.

* **owner** → lands on the Executive Dashboard. Full access: dashboard, forecasting,
  decision support, products, sales entry, stock-in, and the **Refresh** button
  (on-demand incremental ETL).
* **staff** → lands on Direct Sales Entry. Only sales entry + stock-in. No cost,
  gross profit, analytics, forecasts, or alerts.

Background jobs start automatically (`SCHEDULER_ENABLED=true`):
incremental ETL every 15 min, rules every 30 min, database backup nightly at 23:30
into `backups/`.

---

## 4. Dashboards (built into the app)

The owner works from a single interface — no separate BI tool. The Executive
Dashboard and the forecasting/decision-support pages read straight from the
star-schema warehouse, which the ETL keeps current (every 15 min plus the
on-demand **Refresh** button).

Warehouse objects behind the visuals:

* `vw_daily_sales` — revenue, cost, gross profit, units by date / product / category / brand / source
* `vw_monthly_sales` — monthly rollup for trend charts
* `vw_product_velocity` — trailing-90-day units / revenue / gross profit per SKU
* `dim_date`, `dim_product`, `dim_category`, `dim_source`, `fact_transactions` — the star schema

Dashboard views: Revenue Performance, Gross Profit Margin, Product Movement,
Velocity Classification.

---

## 5. Project layout

```
config.py                 env-driven configuration
run.py                    start the Flask app + scheduler
sql/                      01 operational schema, 02 warehouse (star) schema
app/
  __init__.py             app factory
  db.py                   two SQLAlchemy engines (ops + warehouse)
  security.py             login + RBAC (owner / staff)
  auth.py main.py         login, role-based landing
  sales.py stockin.py     direct sales entry + stock movements  (owner + staff)
  products.py             product management                    (owner)
  analytics.py            dashboard KPIs + Refresh + ETL status  (owner)
  forecasting_bp.py       five-model forecasting workspace       (owner)
  alerts_bp.py            rule-based advisories                  (owner)
  etl/
    common.py             transforms + DCR / DRR / LSR metrics
    historical_import.py  one-time legacy load (full cleanse)
    incremental.py        scheduled + on-demand sync
  forecast/
    models.py             SMA, WMA, Linear Regression, ARIMA, Holt-Winters
    evaluate.py           rolling backtest, MSE (primary) / RMSE / MAPE, selection
    service.py            per-SKU forecast + 30-day demand + days-to-depletion
  rules/engine.py         low-stock / stockout / demand-spike / overstock
  scheduler.py backup.py  APScheduler jobs; mysqldump backups
  templates/ static/      server-rendered UI (no external JS libraries)
scripts/                  bootstrap_db, create_admin, seed + sample data, historical import
```

---

## 6. Mapping to the paper

| Paper section | Where it lives |
|---|---|
| 1.5.1 RBAC (owner vs staff) | `app/security.py`, nav in `templates/base.html` |
| 3.2 ETL, DCR/DRR/LSR | `app/etl/*` |
| 3.2.4 incremental + manual Refresh | `app/etl/incremental.py`, `analytics.refresh` |
| 3.3 star schema, `dim_source` values | `sql/02_warehouse_schema.sql` |
| 3.4 descriptive + diagnostic | `app/analytics.py`, `dashboard.html` |
| 3.5 five forecasting models + 3.5.6 evaluation | `app/forecast/*` |
| 3.5 insufficient-history fallback (<24 mo) | `evaluate.evaluate_all` |
| 3.6 rule-based decision support | `app/rules/engine.py` |
| 3.8.3 R-04 backups | `app/backup.py`, `scheduler.py` |
| 3.10 mock-ups | the eight templates |
