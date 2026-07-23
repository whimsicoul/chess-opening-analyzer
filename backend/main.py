import os
import traceback
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import uvicorn
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

                # Guest support: nullable guest_id column alongside user_id
                cur.execute("ALTER TABLE black_opening ADD COLUMN IF NOT EXISTS guest_id TEXT;")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_black_opening_guest_id ON black_opening(guest_id);")
                cur.execute("""
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_bo_guest_moves
                    ON black_opening (guest_id, moves)
                    WHERE guest_id IS NOT NULL
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
                cur.execute("ALTER TABLE black_opening_tree ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_black_opening_tree_user_id ON black_opening_tree(user_id);")

                # Guest support: nullable guest_id column alongside user_id
                cur.execute("ALTER TABLE black_opening_tree ADD COLUMN IF NOT EXISTS guest_id TEXT;")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_black_opening_tree_guest_id ON black_opening_tree(guest_id);")
            conn.commit()
            print("[migrate_black] OK")
    except Exception as e:
        print(f"[migrate_black] ERROR: {e}\n{traceback.format_exc()}")


def _migrate():
    """Create/alter tables to keep the schema up to date."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            # Users table first, since other tables reference it
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
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS lichess_username TEXT;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS chesscom_username TEXT;")

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

            # Games table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS games (
                    id         SERIAL PRIMARY KEY,
                    pgn        TEXT,
                    result     TEXT,
                    white_elo  INTEGER,
                    black_elo  INTEGER,
                    date       DATE,
                    event      TEXT,
                    site       TEXT,
                    round      TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)

            # White opening table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS white_opening (
                    id           SERIAL PRIMARY KEY,
                    opening_name TEXT,
                    eco_code     TEXT,
                    moves        TEXT,
                    color        TEXT NOT NULL DEFAULT 'white'
                )
            """)
        conn.commit()

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
            cur.execute("ALTER TABLE games ADD COLUMN IF NOT EXISTS player_rating INTEGER;")
            cur.execute("ALTER TABLE games ADD COLUMN IF NOT EXISTS time_class TEXT;")
            cur.execute("ALTER TABLE games ADD COLUMN IF NOT EXISTS eco_code TEXT;")
            cur.execute("ALTER TABLE games ADD COLUMN IF NOT EXISTS opening_name TEXT;")
            cur.execute("ALTER TABLE games ADD COLUMN IF NOT EXISTS game_date DATE;")

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

            # Guest support: nullable guest_id column alongside user_id, so games
            # and repertoire lines can be scoped to an anonymous cookie identity
            # instead of a real account.
            cur.execute("ALTER TABLE games ADD COLUMN IF NOT EXISTS guest_id TEXT;")
            cur.execute("ALTER TABLE white_opening ADD COLUMN IF NOT EXISTS guest_id TEXT;")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_games_guest_id ON games(guest_id);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_white_opening_guest_id ON white_opening(guest_id);")

            # Duplicate-game prevention: hash of the raw PGN text, scoped per
            # owner, so re-importing/re-uploading the same game is a no-op
            # instead of creating a second row.
            cur.execute("ALTER TABLE games ADD COLUMN IF NOT EXISTS pgn_hash TEXT;")
            cur.execute("UPDATE games SET pgn_hash = md5(pgn) WHERE pgn_hash IS NULL AND pgn IS NOT NULL;")

            # Remove pre-existing duplicates — keep the lowest id per owner + hash
            cur.execute("""
                DELETE FROM games
                WHERE user_id IS NOT NULL AND id NOT IN (
                    SELECT MIN(id) FROM games WHERE user_id IS NOT NULL GROUP BY user_id, pgn_hash
                )
            """)
            cur.execute("""
                DELETE FROM games
                WHERE guest_id IS NOT NULL AND id NOT IN (
                    SELECT MIN(id) FROM games WHERE guest_id IS NOT NULL GROUP BY guest_id, pgn_hash
                )
            """)

            cur.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS uq_games_user_pgn_hash
                ON games (user_id, pgn_hash)
                WHERE user_id IS NOT NULL
            """)
            cur.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS uq_games_guest_pgn_hash
                ON games (guest_id, pgn_hash)
                WHERE guest_id IS NOT NULL
            """)

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
            # Guest-scoped counterpart — a plain composite index above only
            # dedupes within the same user_id, so guest rows (user_id IS NULL)
            # need their own uniqueness scoped by guest_id instead.
            cur.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS uq_wo_guest_moves_color
                ON white_opening (guest_id, moves, color)
                WHERE guest_id IS NOT NULL
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
            cur.execute("ALTER TABLE white_opening_tree ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_white_opening_tree_user_id ON white_opening_tree(user_id);")

            # Guest support: nullable guest_id column alongside user_id
            cur.execute("ALTER TABLE white_opening_tree ADD COLUMN IF NOT EXISTS guest_id TEXT;")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_white_opening_tree_guest_id ON white_opening_tree(guest_id);")

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

            # ----------------------------------------------------------------
            # Repertoire build bookkeeping (informational — auto-rebuild is
            # additive/merging, so this is not used to gate or protect anything)
            # ----------------------------------------------------------------
            cur.execute("""
                CREATE TABLE IF NOT EXISTS repertoire_builds (
                    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    color       TEXT NOT NULL,
                    built_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    games_count INTEGER,
                    PRIMARY KEY (user_id, color)
                )
            """)

            # Guest support: user_id NOT NULL + a composite PK can't hold a
            # guest row (PK columns disallow NULL), so drop the PK first (a
            # column can't have its NOT NULL relaxed while still part of a
            # PK), then relax user_id and replace the PK with a surrogate id,
            # keeping the same upsert semantics via two partial unique
            # indexes (one per owner kind).
            cur.execute("""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM pg_constraint WHERE conname = 'repertoire_builds_pkey'
                    ) THEN
                        ALTER TABLE repertoire_builds DROP CONSTRAINT repertoire_builds_pkey;
                    END IF;
                END $$;
            """)
            cur.execute("ALTER TABLE repertoire_builds ALTER COLUMN user_id DROP NOT NULL;")
            cur.execute("ALTER TABLE repertoire_builds ADD COLUMN IF NOT EXISTS guest_id TEXT;")
            cur.execute("ALTER TABLE repertoire_builds ADD COLUMN IF NOT EXISTS id SERIAL;")
            cur.execute("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint WHERE conname = 'repertoire_builds_id_pkey'
                    ) THEN
                        ALTER TABLE repertoire_builds ADD CONSTRAINT repertoire_builds_id_pkey PRIMARY KEY (id);
                    END IF;
                END $$;
            """)
            cur.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS uq_repertoire_builds_user_color
                ON repertoire_builds (user_id, color)
                WHERE user_id IS NOT NULL
            """)
            cur.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS uq_repertoire_builds_guest_color
                ON repertoire_builds (guest_id, color)
                WHERE guest_id IS NOT NULL
            """)

        conn.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    _migrate()
    yield


app = FastAPI(title="Chess Opening Analyzer API", lifespan=lifespan)

frontend_url = os.getenv("FRONTEND_URL", "https://chess-opening-analyzer.up.railway.app")
allowed_origins = [frontend_url, "http://localhost:5173", "http://localhost:4173"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router)
app.include_router(openings.router)
app.include_router(black_openings.router)
app.include_router(games.router)


@app.get("/")
def root():
    return {"message": "Chess Opening Analyzer API"}


@app.get("/health")
def health_check():
    return {"status": "ok"}


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8080))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=False
    )
