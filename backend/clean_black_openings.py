"""
Remove all black-color repertoire entries for the Whimsicoul user.
Run once to clean up spurious data, then restart the backend
(which will also enforce the new unique constraint via migration).

Usage (from the backend/ directory):
    python clean_black_openings.py
"""
import os
import sys
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()


def main():
    conn = psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", 5432),
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        cursor_factory=RealDictCursor,
    )
    conn.autocommit = False
    try:
        cur = conn.cursor()

        cur.execute(
            "SELECT id FROM users WHERE LOWER(username) = LOWER(%s)",
            ("Whimsicoul",),
        )
        row = cur.fetchone()
        if row is None:
            print("ERROR: User 'Whimsicoul' not found.")
            conn.close()
            sys.exit(1)
        user_id = row["id"]
        print(f"Found Whimsicoul — user_id={user_id}")

        cur.execute(
            "DELETE FROM opening_tree WHERE user_id = %s AND color = 'black'",
            (user_id,),
        )
        tree_del = cur.rowcount

        cur.execute(
            "DELETE FROM white_opening WHERE user_id = %s AND color = 'black'",
            (user_id,),
        )
        lines_del = cur.rowcount

        conn.commit()
        print(f"Deleted {lines_del} black opening lines and {tree_del} tree nodes.")

    except Exception as e:
        conn.rollback()
        print(f"ERROR: {e}")
        conn.close()
        sys.exit(1)

    conn.close()


if __name__ == "__main__":
    main()
