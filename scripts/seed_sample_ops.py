"""Optional: add a staff user and a few live products so you can click through
the sales / stock-in screens without running the historical import first.

    python scripts/seed_sample_ops.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from sqlalchemy import text  # noqa: E402
from app.db import ops_conn  # noqa: E402
from app.security import hash_password  # noqa: E402

DEMO_PRODUCTS = [
    # sku, name, category, brand, cost, price, rop, stock
    ("DEMO-001", "Spark Plug NGK CPR6EA-9", "Electrical", "NGK", 95, 160, 20, 60),
    ("DEMO-002", "Engine Oil Motul 10W40 1L", "Engine Oil", "Motul", 240, 420, 15, 25),
    ("DEMO-003", "Front Brake Pad Set Bendix", "Brake Parts", "Bendix", 180, 330, 12, 8),
    ("DEMO-004", "Air Filter Aspira Beat", "Filters", "Aspira", 110, 210, 15, 40),
    ("DEMO-005", "Drive Belt Aspira Mio", "Drive Train", "Aspira", 320, 560, 10, 5),
    ("DEMO-006", "Battery Yuasa YTZ5S", "Electrical", "Yuasa", 780, 1250, 8, 14),
    ("DEMO-007", "Inner Tube 2.75-17", "Tires & Tubes", "Generic", 95, 180, 25, 70),
    ("DEMO-008", "Roller Weight Set Dr.Pulley", "Drive Train", "Generic", 260, 470, 10, 3),
]


def main():
    with ops_conn() as c:
        if not c.execute(text("SELECT 1 FROM users WHERE username='staff1'")).first():
            c.execute(text("""INSERT INTO users (username, full_name, password_hash, role)
                              VALUES ('staff1','Counter Staff',:p,'staff')"""),
                      {"p": hash_password("staff123")})
            print("created staff user  staff1 / staff123")
        for sku, name, cat, brand, cost, price, rop, stock in DEMO_PRODUCTS:
            if c.execute(text("SELECT 1 FROM products WHERE sku=:s"), {"s": sku}).first():
                continue
            pid = c.execute(text("""
                INSERT INTO products (sku,name,category,brand,supplier,unit_cost,
                    unit_price,reorder_point,stock_on_hand,source_type)
                VALUES (:sku,:name,:cat,:brand,'Metro Parts Trading',:cost,:price,:rop,
                        :stock,'Direct Sales Entry')
            """), dict(sku=sku, name=name, cat=cat, brand=brand, cost=cost,
                       price=price, rop=rop, stock=stock)).lastrowid
            c.execute(text("""INSERT INTO stock_movements (product_id,sku,movement_type,
                              quantity,balance_after,user_id,reference,note)
                              VALUES (:p,:s,'adjustment',:q,:q,1,'opening','seed')"""),
                      {"p": pid, "s": sku, "q": stock})
        print(f"ensured {len(DEMO_PRODUCTS)} demo products")


if __name__ == "__main__":
    main()
