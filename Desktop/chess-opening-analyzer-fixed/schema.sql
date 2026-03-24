-- chess-opening-analyzer schema
-- Changes from original:
--   1. games table: added eco_code, opening_name, game_date columns
--   2. game_deviations: renamed move_uci -> move_san (it was always SAN)
--   3. deviation_stats: switched from MATERIALIZED VIEW to regular VIEW
--      (auto-updates, no manual REFRESH needed at this data volume)
--   4. deviation_stats: now groups by eco_code and opening_name for richer analysis

-- ============================================================
-- white_opening  (source repertoire lines — unchanged)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.white_opening (
    id           SERIAL PRIMARY KEY,
    opening_name VARCHAR(255),
    eco_code     VARCHAR(10),
    moves        TEXT
);

-- ============================================================
-- opening_tree  (the traversal tree built from white_opening)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.opening_tree (
    id           SERIAL PRIMARY KEY,
    parent_id    INTEGER,
    move_san     TEXT,
    opening_name VARCHAR(255),
    eco_code     VARCHAR(10)
);

CREATE INDEX IF NOT EXISTS idx_opening_tree_parent_move
    ON public.opening_tree USING btree (parent_id, move_san);

-- ============================================================
-- games  (one row per processed PGN game)
-- IMPROVEMENT: added eco_code, opening_name, game_date
-- ============================================================
CREATE TABLE IF NOT EXISTS public.games (
    id           SERIAL PRIMARY KEY,
    result       VARCHAR(10),
    eco_code     VARCHAR(10),
    opening_name VARCHAR(255),
    game_date    VARCHAR(20)
);

-- ============================================================
-- game_deviations  (one row per game where a deviation occurred)
-- FIX: renamed move_uci -> move_san (it was always SAN, not UCI)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.game_deviations (
    id                    SERIAL PRIMARY KEY,
    game_id               INTEGER REFERENCES public.games(id),
    move_number           INTEGER,
    move_san              TEXT,          -- renamed from move_uci
    position_id           INTEGER,
    deviation_depth       INTEGER,
    line_depth            INTEGER,
    completion_percentage DOUBLE PRECISION,
    opponent_deviation    BOOLEAN        -- FIX: was never populated before
);

-- ============================================================
-- pgn_games  (raw PGN storage — separate from analysis pipeline)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pgn_games (
    id           SERIAL PRIMARY KEY,
    opening_name VARCHAR(255),
    eco_code     VARCHAR(10),
    result       VARCHAR(10),
    pgn_data     TEXT UNIQUE
);

-- ============================================================
-- deviation_stats
-- IMPROVEMENT: regular VIEW instead of MATERIALIZED VIEW so it
--              always reflects current data without manual REFRESH.
-- IMPROVEMENT: groups by eco_code and opening_name for richer querying.
-- ============================================================
CREATE OR REPLACE VIEW public.deviation_stats AS
SELECT
    gd.move_number,
    gd.opponent_deviation,
    g.eco_code,
    g.opening_name,
    COUNT(*)                          AS total_games,
    ROUND(AVG(
        CASE
            WHEN g.result = '1-0'       THEN 1.0
            WHEN g.result = '0-1'       THEN 0.0
            ELSE 0.5
        END
    ) * 100, 2)                       AS avg_score_percent
FROM public.game_deviations gd
JOIN public.games g ON g.id = gd.game_id
GROUP BY gd.move_number, gd.opponent_deviation, g.eco_code, g.opening_name;

-- ============================================================
-- black_opening  (source repertoire lines for black)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.black_opening (
    id           SERIAL PRIMARY KEY,
    opening_name VARCHAR(255),
    eco_code     VARCHAR(10),
    moves        TEXT
);

-- ============================================================
-- black_opening_tree  (the traversal tree built from black_opening)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.black_opening_tree (
    id           SERIAL PRIMARY KEY,
    parent_id    INTEGER,
    move_san     TEXT,
    opening_name VARCHAR(255),
    eco_code     VARCHAR(10)
);

CREATE INDEX IF NOT EXISTS idx_black_opening_tree_parent_move
    ON public.black_opening_tree USING btree (parent_id, move_san);

-- ============================================================
-- black_game_deviations  (deviations when playing as black)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.black_game_deviations (
    id                    SERIAL PRIMARY KEY,
    game_id               INTEGER REFERENCES public.games(id),
    move_number           INTEGER,
    move_san              TEXT,
    position_id           INTEGER,
    deviation_depth       INTEGER,
    line_depth            INTEGER,
    completion_percentage DOUBLE PRECISION,
    opponent_deviation    BOOLEAN
);

-- ============================================================
-- black_deviation_stats  (mirror of deviation_stats for black)
-- ============================================================
CREATE OR REPLACE VIEW public.black_deviation_stats AS
SELECT
    gd.move_number,
    gd.opponent_deviation,
    g.eco_code,
    g.opening_name,
    COUNT(*)                          AS total_games,
    ROUND(AVG(
        CASE
            WHEN g.result = '0-1'       THEN 1.0
            WHEN g.result = '1-0'       THEN 0.0
            ELSE 0.5
        END
    ) * 100, 2)                       AS avg_score_percent
FROM public.black_game_deviations gd
JOIN public.games g ON g.id = gd.game_id
GROUP BY gd.move_number, gd.opponent_deviation, g.eco_code, g.opening_name;

-- Useful queries:
--
-- All stats:
--   SELECT * FROM deviation_stats ORDER BY move_number;
--
-- Your deviations only:
--   SELECT * FROM deviation_stats WHERE NOT opponent_deviation ORDER BY avg_score_percent DESC;
--
-- Opponent deviations by opening:
--   SELECT opening_name, eco_code, move_number, avg_score_percent
--   FROM deviation_stats
--   WHERE opponent_deviation
--   ORDER BY avg_score_percent DESC;
