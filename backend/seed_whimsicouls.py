"""
Seed the Whimsicouls account with 35 white opening lines recovered from the old database.

Usage (from the backend/ directory):
    python seed_whimsicouls.py

Requires the same .env as the main app (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD).
"""

import re
import os
import sys
import chess

import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Lines to seed — space-separated SAN (move numbers stripped from old format)
# ---------------------------------------------------------------------------

LINES = [
    ("KIA",                                    "A07", "Nf3 d5 g3 Nf6 Bg2 c5 O-O Nc6 d4 cxd4 Nxd4 e5 Nxc6 bxc6 c4"),
    ("KIA",                                    "A07", "Nf3 d5 g3 Nf6 Bg2 c5 O-O Nc6 d4 e6 dxc5 Bxc5 c4"),
    ("KIA",                                    "A07", "Nf3 d5 g3 Nf6 Bg2 c5 O-O g6 d4 cxd4 Nxd4 e5 Nb3 Be6 c4"),
    ("KIA",                                    "A07", "Nf3 d5 g3 Nf6 Bg2 c5 O-O g6 d4 cxd4 Nxd4 Bg7 Nb3 Nc6 Nc3 e6 e4"),
    ("KIA",                                    "A07", "Nf3 d5 g3 Nf6 Bg2 c5 O-O g6 d4 Bg7 dxc5"),
    ("KIA Yugoslav Variation",                 "A07", "Nf3 d5 g3 Nf6 Bg2 c6 O-O Bg4 h3 Bxf3 Bxf3 e5 d4 e4 Bg2 Be7 c4"),
    ("KIA Yugoslav Variation",                 "A07", "Nf3 d5 g3 Nf6 Bg2 c6 O-O Bg4 h3 Bh5 c4 dxc4 Na3 b5 Ne5 Nd5 d3 cxd3 Nxd3 e6 Nxb5 cxb5 Nf4"),
    ("KIA Yugoslav Variation",                 "A07", "Nf3 d5 g3 Nf6 Bg2 c6 O-O Bg4 h3 Bh5 c4 dxc4 Na3 b5 Ne5 Nd5 d3 c3 Qb3 b4 bxc3 bxa3 Qb7 Nd7 Nxd7 Qc8 Qxc8+ Rxc8 Nxf8"),
    ("KIA Yugoslav Variation",                 "A07", "Nf3 d5 g3 Nf6 Bg2 c6 O-O Bg4 h3 Bh5 c4 dxc4 Na3 b5 Ne5 Nd5 d3 c3 Qb3 e6 bxc3"),
    ("KIA Yugoslav Variation",                 "A07", "Nf3 d5 g3 Nf6 Bg2 c6 O-O Bg4 h3 Bh5 c4 e6 d4 Nbd7 cxd5 exd5 Nh4 Be7 Qb3 Qb6 Qe3 Bg6 Nxg6 hxg6"),
    ("KIA Yugoslav Variation",                 "A07", "Nf3 d5 g3 Nf6 Bg2 c6 O-O Bg4 h3 Bh5 c4 e6 d4 Nbd7 cxd5 cxd5 Nc3 Be7 Ne5 O-O g4 Bg6 f4 Be4 Nxd7"),
    ("KIA Yugoslav Variation",                 "A07", "Nf3 d5 g3 Nf6 Bg2 c6 O-O Bg4 h3 Bh5 c4 e6 d4 Be7 Nc3 O-O g4 Bg6 Ne5"),
    ("KIA Yugoslav Variation",                 "A07", "Nf3 d5 g3 Nf6 Bg2 c6 O-O Bg4 h3 Bh5 c4 e6 d4 Be7 Nc3 Bxf3 Bxf3 dxc4 b3 cxb3 Qxb3 Qb6 Qd1 O-O Rb1 Qa6 Qb3"),
    ("KIA",                                    "A07", "Nf3 d5 g3 Nf6 Bg2 c6 O-O e6 d4 Be7 Nbd2 O-O Re1 Re8 e4 dxe4 Nxe4 Nxe4 Rxe4"),
    ("KIA",                                    "A07", "Nf3 d5 g3 Nf6 Bg2 c6 O-O e6 d4 Nbd7 Nbd2 Be7 Re1 O-O e4 dxe4 Nxe4 Nxe4 Rxe4"),
    ("KIA",                                    "A07", "Nf3 d5 g3 Nf6 Bg2 c6 O-O e6 d4 Nbd7 Nbd2 Bd6 Re1 O-O e4 dxe4 Nxe4 Nxe4 Rxe4"),
    ("KIA",                                    "A07", "Nf3 d5 g3 Nf6 Bg2 c6 O-O e6 d4 Bd6 Re1 O-O Nbd2"),
    ("KIA",                                    "A07", "Nf3 d5 g3 Nf6 Bg2 c6 O-O Bf5 c4 dxc4 Na3 b5 b3 cxb3 Qxb3 e6 d3 Bc5 Nh4 Bg4 Nxb5 Bxe2 Ba3 Bxf1 Bxc5"),
    ("KIA",                                    "A07", "Nf3 d5 g3 Nf6 Bg2 c6 O-O Bf5 c4 e6 cxd5 exd5 d3"),
    ("KIA",                                    "A07", "Nf3 d5 g3 Nf6 Bg2 c6 O-O Bf5 c4 e6 cxd5 cxd5 Qb3"),
    ("KIA",                                    "A07", "Nf3 d5 g3 Nf6 Bg2 c6 O-O g6"),
    ("KIA",                                    "A07", "Nf3 d5 g3 Nf6 Bg2 c6 c4 dxc4 O-O e6 a4 Nbd7 Qc2"),
    ("KIA",                                    "A07", "Nf3 d5 g3 Nf6 Bg2 c6 c4 e6 d4"),
    ("KIA",                                    "A07", "Nf3 d5 g3 Nf6 Bg2 c6 c4 g6 b3 Bg7 Bb2"),
    ("Zukertort Opening Sicilian Invitation",  "A04", "Nf3 c5 c4 Nf6 Nc3 e6 g3 d5 cxd5 exd5 d4"),
    ("Zukertort Opening Sicilian Invitation",  "A04", "Nf3 c5 c4 Nf6 Nc3 Nc6 g3 d5 d4 e6 cxd5 Nxd5 Bg2 cxd4 Nxd4 Nxc3 bxc3 Nxd4 Qxd4 Qxd4 cxd4 Bb4+ Bd2 Bxd2+ Kxd2 Ke7 Rhc1"),
    ("Zukertort Opening Sicilian Invitation",  "A04", "Nf3 c5 c4 Nf6 Nc3 Nc6 g3 d5 d4 e6 cxd5 Nxd5 Bg2 Nxd4 Nxd4 Nxc3 bxc3 cxd4 Qa4+ Qd7 Qc4 dxc3 O-O"),
    ("Zukertort Opening Sicilian Invitation",  "A04", "Nf3 c5 c4 Nf6 Nc3 Nc6 g3 d5 d4 cxd4 Nxd4 dxc4 Nxc6 Qxd1+ Nxd1 bxc6 Bg2 Nd5 Ne3 e6 Nxc4"),
    ("Zukertort Opening Sicilian Invitation",  "A04", "Nf3 c5 c4 Nf6 Nc3 Nc6 g3 d5 d4 g6 Bg2 Bg7 dxc5 dxc4"),
    ("Zukertort Opening Sicilian Invitation",  "A04", "Nf3 c5 c4 Nf6 Nc3 Nc6 g3 e6 Bg2 d5 cxd5 exd5 d4"),
    ("Zukertort Opening Sicilian Invitation",  "A04", "Nf3 c5 c4 Nf6 Nc3 g6 g3 Bg7 d4 cxd4 Nxd4"),
    ("Zukertort Opening Sicilian Invitation",  "A04", "Nf3 c5 c4 Nc6 Nc3 e5 g3"),
    ("Zukertort Opening Sicilian Invitation",  "A04", "Nf3 c5 c4 e6 g3 d5 cxd5 exd5 d4"),
    ("Zukertort Opening Sicilian Invitation",  "A04", "Nf3 e6 g3 d5 Bg2 Nf6 O-O Be7 d4 O-O c4"),
    # Line 35 is identical to line 6 — deduplication handles it
    ("KIA",                                    "A07", "Nf3 d5 g3 Nf6 Bg2 c6 O-O Bg4 h3 Bxf3 Bxf3 e5 d4 e4 Bg2 Be7 c4"),
]


# ---------------------------------------------------------------------------
# Opening-tree sync (mirrors routers/openings.py:_sync_tree)
# ---------------------------------------------------------------------------

def _sync_tree(cur, user_id: int, color: str, lines: list):
    cur.execute(
        "DELETE FROM opening_tree WHERE user_id = %s AND color = %s",
        (user_id, color),
    )
    for line in lines:
        board = chess.Board()
        parent_id = 0
        tokens = (line["moves"] or "").split()
        for san in tokens:
            try:
                board.push_san(san)
            except Exception:
                break
            cur.execute(
                "SELECT id FROM opening_tree WHERE parent_id = %s AND move_san = %s AND user_id = %s AND color = %s",
                (parent_id, san, user_id, color),
            )
            row = cur.fetchone()
            if row:
                parent_id = row["id"]
            else:
                cur.execute(
                    """
                    INSERT INTO opening_tree (parent_id, move_san, opening_name, eco_code, user_id, color)
                    VALUES (%s, %s, %s, %s, %s, %s) RETURNING id
                    """,
                    (parent_id, san, line["opening_name"], line["eco_code"], user_id, color),
                )
                parent_id = cur.fetchone()["id"]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

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

        # Find the Whimsicoul user
        cur.execute(
            "SELECT id FROM users WHERE LOWER(username) = LOWER(%s)",
            ("Whimsicoul",),
        )
        row = cur.fetchone()
        if row is None:
            print("ERROR: No user named 'Whimsicoul' found in the database.")
            print("Make sure the account exists before running this script.")
            conn.close()
            sys.exit(1)

        user_id = row["id"]
        print(f"Found Whimsicoul — user_id={user_id}")

        inserted = 0
        skipped  = 0

        for opening_name, eco_code, moves in LINES:
            # Deduplicate: skip if this exact moves string already exists for this user+color
            cur.execute(
                "SELECT id FROM white_opening WHERE user_id = %s AND color = %s AND moves = %s",
                (user_id, "white", moves),
            )
            if cur.fetchone():
                skipped += 1
                continue

            cur.execute(
                """
                INSERT INTO white_opening (opening_name, eco_code, moves, user_id, color)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (opening_name, eco_code, moves, user_id, "white"),
            )
            inserted += 1

        # Rebuild the opening tree from all white lines for this user
        cur.execute(
            "SELECT opening_name, eco_code, moves FROM white_opening WHERE user_id = %s AND color = %s",
            (user_id, "white"),
        )
        all_lines = cur.fetchall()
        _sync_tree(cur, user_id, "white", all_lines)

        conn.commit()
        cur.close()

    except Exception as e:
        conn.rollback()
        print(f"ERROR: {e}")
        conn.close()
        sys.exit(1)

    print(f"Done. Inserted {inserted} / {len(LINES)} lines ({skipped} already existed or duplicate).")
    conn.close()


if __name__ == "__main__":
    main()
