"""One-shot database bootstrap.

Connects to MySQL as an admin account, creates the two databases and a
dedicated least-privilege application user, runs the DDL scripts, seeds
dim_date + dim_source, and writes .env for the app.

    python scripts/bootstrap_db.py --admin-user root --admin-password "YOURPW"

Options:
    --app-user   (default j1spa_app)
    --app-password  (default: generated)
    --host / --port  (default 127.0.0.1 / 3306)
    --drop           drop & recreate the databases first
"""
from __future__ import annotations
import argparse
import secrets
import sys
from datetime import date, timedelta
from pathlib import Path

import pymysql

ROOT = Path(__file__).resolve().parent.parent
SQL_DIR = ROOT / "sql"


def run_sql_script(cur, path: Path):
    sql = path.read_text(encoding="utf-8")
    # naive splitter is fine here: our DDL has no stored-proc bodies with ';'
    for stmt in [s.strip() for s in sql.split(";") if s.strip()]:
        cur.execute(stmt)


def seed_dim_date(cur, start=date(2020, 1, 1), end=date(2027, 12, 31)):
    cur.execute("USE j1spa_dw")
    d = start
    batch = []
    while d <= end:
        batch.append((
            d.year * 10000 + d.month * 100 + d.day, d, d.year,
            (d.month - 1) // 3 + 1, d.month, d.strftime("%B"),
            int(d.strftime("%W")), d.day, d.isoweekday(), d.strftime("%A"),
            1 if d.isoweekday() >= 6 else 0,
        ))
        d += timedelta(days=1)
    cur.executemany("""
        INSERT IGNORE INTO dim_date
        (date_key, full_date, year, quarter, month, month_name, week_of_year,
         day_of_month, day_of_week, day_name, is_weekend)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
    """, batch)
    cur.executemany(
        "INSERT IGNORE INTO dim_source (source_type) VALUES (%s)",
        [("Direct Sales Entry",), ("Historical Migration",)])
    for tbl, col, val in [("dim_category", "category_name", "Uncategorized"),
                          ("dim_brand", "brand_name", "Generic"),
                          ("dim_supplier", "supplier_name", "Unknown")]:
        cur.execute(f"INSERT IGNORE INTO {tbl} ({col}) VALUES (%s)", (val,))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--admin-user", default="root")
    ap.add_argument("--admin-password", required=True)
    ap.add_argument("--app-user", default="j1spa_app")
    ap.add_argument("--app-password", default=None)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=3306)
    ap.add_argument("--drop", action="store_true")
    args = ap.parse_args()

    app_pw = args.app_password or secrets.token_urlsafe(18)

    conn = pymysql.connect(host=args.host, port=args.port, user=args.admin_user,
                           password=args.admin_password, autocommit=True)
    cur = conn.cursor()

    if args.drop:
        cur.execute("DROP DATABASE IF EXISTS j1spa_ops")
        cur.execute("DROP DATABASE IF EXISTS j1spa_dw")
        print("dropped existing databases")

    print("running 01_operational_schema.sql ...")
    run_sql_script(cur, SQL_DIR / "01_operational_schema.sql")
    print("running 02_warehouse_schema.sql ...")
    run_sql_script(cur, SQL_DIR / "02_warehouse_schema.sql")

    print("creating application user ...")
    host = "127.0.0.1"          # app connects over local TCP only
    cur.execute(f"CREATE USER IF NOT EXISTS '{args.app_user}'@'{host}' IDENTIFIED BY %s", (app_pw,))
    cur.execute(f"ALTER USER '{args.app_user}'@'{host}' IDENTIFIED BY %s", (app_pw,))
    for db in ("j1spa_ops", "j1spa_dw"):
        cur.execute(f"GRANT ALL PRIVILEGES ON {db}.* TO '{args.app_user}'@'{host}'")
    cur.execute("FLUSH PRIVILEGES")

    print("seeding dim_date / dim_source ...")
    seed_dim_date(cur)

    cur.close(); conn.close()

    env_path = ROOT / ".env"
    secret = secrets.token_urlsafe(32)
    env_path.write_text(
        f"FLASK_SECRET_KEY={secret}\n"
        f"FLASK_DEBUG=1\n"
        f"DB_HOST={args.host}\nDB_PORT={args.port}\n"
        f"DB_USER={args.app_user}\nDB_PASSWORD={app_pw}\n"
        f"OPS_DB=j1spa_ops\nDW_DB=j1spa_dw\n"
        f'MYSQL_BIN=C:/Program Files/MySQL/MySQL Server 8.0/bin\n'
        f"SCHEDULER_ENABLED=true\nINCREMENTAL_INTERVAL_MIN=15\nRULES_INTERVAL_MIN=30\n"
        f"BACKUP_HOUR=23\nBACKUP_MINUTE=30\nBACKUP_KEEP=7\n"
        f"HOST=127.0.0.1\nPORT=5000\n",
        encoding="utf-8")
    print(f"\nOK. Wrote {env_path}")
    print(f"    app user : {args.app_user}")
    print(f"    app pass : {app_pw}")
    print("\nNext:  python scripts/create_admin.py --username owner --name \"Store Owner\" --role owner")


if __name__ == "__main__":
    sys.exit(main())
