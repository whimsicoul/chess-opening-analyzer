import os
import traceback
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from routers import openings, black_openings, games
from routers import auth
from db import get_connection

load_dotenv()


def _migrate_black():
    """Ensure black opening tables exist with all required columns (own transaction)."""
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS black_opening (
                        id            SERIAL PRIMARY KEY,
                        opening_name  TEXT,
                        eco_code      TEXT,
                        moves         TEXT,
                        user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE
                    )
                """)
                cur.execute("ALTER TABLE black_opening ADD COLUMN IF NOT EXISTS id SERIAL PRIMARY KEY;")
                cur.execute("ALTER TABLE black_opening ADD COLUMN IF NOT EXISTS opening_name TEXT;")
                cur.execute("ALTER TABLE black_opening ADD COLUMN IF NOT EXISTS eco_code TEXT;")
                cur.execute("ALTER TABLE black_opening ADD COLUMN IF NOT EXISTS moves TEXT;")
                cur.execute("ALTER TABLE black_opening ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_black_opening_user_id ON black_opening(user_id);")
                cur.execute("""
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_bo_user_moves
                    ON black_opening (user_id, moves)
                """)

                cur.execute("""
                    CREATE TABLE IF NOT EXISTS black_opening_tree (
                        id            SERIAL PRIMARY KEY,
                        parent_id     INTEGER NOT NULL DEFAULT 0,
                        move_san      TEXT,
                        opening_name  TEXT,
                        eco_code      TEXT,
                        user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE
                    )
                """)
                cur.execute("ALTER TABLE black_opening_tree ADD COLUMN IF NOT EXISTS id SERIAL PRIMARY KEY;")
                cur.execute("ALTER TABLE black_opening_tree ADD COLUMN IF NOT EXISTS parent_id INTEGER NOT NULL DEFAULT 0;")
                cur.execute("ALTER TABLE black_opening_tree ADD COLUMN IF NOT EXISTS move_san TEXT;")
                cur.execute("ALTER TABLE black_opening_tree ADD COLUMN IF NOT EXISTS opening_name TEXT;")
                cur.execute("ALTER TABLE black_opening_tree ADD COLUMN IF NOT EXISTS eco_code TEXT;")
                cur.execute("ALTER TABLE black_opening_tree ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_black_opening_tree_user_id ON black_opening_tree(user_id);")
            conn.commit()
            print("[migrate_black] OK")
    except Exception as e:
        print(f"[migrate_black] ERROR: {e}\n{traceback.format_exc()}")


def _migrate():
    """Create/alter tables to keep the schema up to date."""
    try:
      _migrate_black()
    except Exception as e:
        print(f"[migrate] black migration failed: {e}")
    with get_connection() as conn:
        with conn.cursor() as cur:
            # Original columns
            cur.execute("ALTER TABLE games ADD COLUMN IF NOT EXISTS player_color TEXT;")
            cur.execute("ALTER TABLE games ADD COLUMN IF NOT EXISTS white_player TEXT;")
            cur.execute("ALTER TABLE games ADD COLUMN IF NOT EXISTS black_player TEXT;")
            cur.execute("ALTER TABLE games ADD COLUMN IF NOT EXISTS opponent_rating INTEGER;")

            # Users table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id              SERIAL PRIMARY KEY,
                    username        TEXT NOT NULL UNIQUE,
                    email           TEXT NOT NULL UNIQUE,
                    hashed_password TEXT NOT NULL,
                    is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)

            # Email verification codes
            cur.execute("""
                CREATE TABLE IF NOT EXISTS email_verifications (
                    id         SERIAL PRIMARY KEY,
                    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    code       CHAR(6) NOT NULL,
                    expires_at TIMESTAMPTZ NOT NULL,
                    used       BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)

            # Game deviation tracking
            cur.execute("""
                CREATE TABLE IF NOT EXISTS game_deviations (
                    id                    SERIAL PRIMARY KEY,
                    game_id               INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                    move_number           INTEGER,
                    move_uci              TEXT,
                    opponent_deviation    BOOLEAN,
                    deviation_depth       INTEGER,
                    completion_percentage FLOAT
                )
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_game_deviations_game_id ON game_deviations(game_id);")

            # Add user_id to existing tables
            cur.execute("ALTER TABLE games ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;")
            cur.execute("ALTER TABLE white_opening ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;")

            # Color column for white repertoire (legacy — kept for migration)
            cur.execute("ALTER TABLE white_opening ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT 'white';")

            # Indexes for fast per-user queries
            cur.execute("CREATE INDEX IF NOT EXISTS idx_games_user_id ON games(user_id);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_white_opening_user_id ON white_opening(user_id);")

            # Remove duplicate rows — keep the lowest id per (user_id, moves, color)
            cur.execute("""
                DELETE FROM white_opening
                WHERE id NOT IN (
                    SELECT MIN(id)
                    FROM white_opening
                    GROUP BY user_id, moves, color
                )
            """)

            # Unique index to prevent future duplicates (IF NOT EXISTS works; ADD CONSTRAINT does not)
            cur.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS uq_wo_user_moves_color
                ON white_opening (user_id, moves, color)
            """)

            # ----------------------------------------------------------------
            # Dedicated opening tree table for white
            # ----------------------------------------------------------------
            cur.execute("""
                CREATE TABLE IF NOT EXISTS white_opening_tree (
                    id            SERIAL PRIMARY KEY,
                    parent_id     INTEGER NOT NULL DEFAULT 0,
                    move_san      TEXT,
                    opening_name  TEXT,
                    eco_code      TEXT,
                    user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE
                )
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_white_opening_tree_user_id ON white_opening_tree(user_id);")

            # Migrate legacy opening_tree table if it still exists
            cur.execute("""
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_name = 'opening_tree'
                )
            """)
            if cur.fetchone()["exists"]:
                # Apply columns and index only while the table still exists
                cur.execute("ALTER TABLE opening_tree ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;")
                cur.execute("ALTER TABLE opening_tree ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT 'white';")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_opening_tree_user_id ON opening_tree(user_id);")
                cur.execute("""
                    INSERT INTO white_opening_tree (id, parent_id, move_san, opening_name, eco_code, user_id)
                    OVERRIDING SYSTEM VALUE
                    SELECT id, parent_id, move_san, opening_name, eco_code, user_id
                    FROM opening_tree WHERE color = 'white' OR color IS NULL
                    ON CONFLICT (id) DO NOTHING
                """)
                cur.execute("""
                    SELECT setval('white_opening_tree_id_seq',
                        COALESCE((SELECT MAX(id) FROM white_opening_tree), 1))
                """)
                cur.execute("DROP TABLE opening_tree;")

        conn.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    _migrate()
    yield


app = FastAPI(title="Chess Opening Analyzer API", lifespan=lifespan)

frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router)
app.include_router(openings.router)
app.include_router(black_openings.router)
app.include_router(games.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
