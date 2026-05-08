#!/usr/bin/env python3
"""
Apply demo password fixes without the mysql CLI (uses mysql-connector-python).

From repo root:
  cd back-end/back-end && pip install -r requirements.txt
  python3 ../../database/apply_demo_passwords.py

Or from database/:
  python3 apply_demo_passwords.py

Env (optional; defaults match app.py):
  MYSQL_HOST  MYSQL_PORT (default 3306)  MYSQL_USER  MYSQL_PASSWORD  MYSQL_DATABASE
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

HASH = "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8"

def _load_dotenv() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    here = Path(__file__).resolve().parent
    for p in (
        here.parent / "back-end" / "back-end" / ".env",
        here / ".env",
    ):
        if p.is_file():
            load_dotenv(p)
            return


def main() -> int:
    _load_dotenv()
    try:
        import mysql.connector
    except ImportError:
        print("Install deps: pip install mysql-connector-python", file=sys.stderr)
        return 1

    port = os.environ.get("MYSQL_PORT", "").strip()
    cfg = {
        "host": os.environ.get("MYSQL_HOST", "localhost"),
        "port": int(port) if port else 3306,
        "user": os.environ.get("MYSQL_USER", "root"),
        "password": os.environ.get("MYSQL_PASSWORD", ""),
        "database": os.environ.get("MYSQL_DATABASE", "LOGISTICS_COMPANY"),
    }

    try:
        conn = mysql.connector.connect(**cfg)
    except Exception as e:
        print(f"Could not connect to MySQL: {e}", file=sys.stderr)
        print(
            "Start the MySQL/MariaDB server, or set MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE.",
            file=sys.stderr,
        )
        print(f"Using host={cfg['host']} port={cfg['port']} database={cfg['database']}.", file=sys.stderr)
        return 2

    cur = conn.cursor()
    try:
        cur.execute(
            """
            UPDATE ADMIN SET password_hash = %s
            WHERE admin_id IN (99991, 99992, 99993, 99994, 99995)
            """,
            (HASH,),
        )
        print(f"ADMIN rows updated: {cur.rowcount}")

        cur.execute(
            """
            UPDATE CUSTOMER
            SET password_hash = %s, email = 'customer@example.com'
            WHERE customer_id = 8
            """,
            (HASH,),
        )
        print(f"CUSTOMER row 8 updated: {cur.rowcount}")

        cur.execute(
            """
            UPDATE DRIVER
            SET password_hash = %s, email = 'driver@example.com'
            WHERE driver_id = 2001
            """,
            (HASH,),
        )
        print(f"DRIVER row 2001 updated: {cur.rowcount}")

        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"SQL error: {e}", file=sys.stderr)
        return 3
    finally:
        cur.close()
        conn.close()

    print("Done. Login with password: password (admin1@logistics.com, customer@example.com, driver@example.com).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
