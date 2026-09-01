"""Create or update a user (owner or staff).

    python scripts/create_admin.py --username owner --name "Store Owner" --role owner
    python scripts/create_admin.py --username staff1 --name "Counter Staff" --role staff --password Passw0rd!

If --password is omitted you'll be prompted (input hidden).
"""
import argparse
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from sqlalchemy import text  # noqa: E402
from app.db import ops_conn  # noqa: E402
from app.security import hash_password  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--username", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--role", choices=["owner", "staff"], required=True)
    ap.add_argument("--password")
    args = ap.parse_args()

    pw = args.password or getpass.getpass("Password: ")
    if len(pw) < 6:
        sys.exit("Password must be at least 6 characters.")
    ph = hash_password(pw)

    with ops_conn() as c:
        existing = c.execute(text("SELECT user_id FROM users WHERE username=:u"),
                             {"u": args.username}).first()
        if existing:
            c.execute(text("""UPDATE users SET full_name=:n, password_hash=:p,
                              role=:r, is_active=1 WHERE username=:u"""),
                      {"n": args.name, "p": ph, "r": args.role, "u": args.username})
            print(f"updated user '{args.username}' ({args.role})")
        else:
            c.execute(text("""INSERT INTO users (username, full_name, password_hash, role)
                              VALUES (:u,:n,:p,:r)"""),
                      {"u": args.username, "n": args.name, "p": ph, "r": args.role})
            print(f"created user '{args.username}' ({args.role})")


if __name__ == "__main__":
    main()
