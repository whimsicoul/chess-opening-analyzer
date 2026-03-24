import io
from fastapi import APIRouter, HTTPException, UploadFile, File
import chess.pgn
from db import get_connection

router = APIRouter(prefix="/games", tags=["games"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_pgn(pgn_text: str) -> chess.pgn.Game:
    game = chess.pgn.read_game(io.StringIO(pgn_text))
    if game is None:
        raise HTTPException(status_code=422, detail="Could not parse PGN")
    return game


def _extract_moves(game: chess.pgn.Game) -> list[str]:
    """Return moves as a list of SAN strings in ply order."""
    board = game.board()
    moves = []
    for move in game.mainline_moves():
        moves.append(board.san(move))
        board.push(move)
    return moves


def _detect_deviation(cur, moves: list[str]) -> dict | None:
    """
    Walk the opening_tree following the game's moves.
    opening_tree schema: id, parent_id, move_san, opening_name, eco_code
    Root nodes have parent_id = 0.
    Returns dict with deviation_move_number, deviated_by, game_move, expected_moves
    or None if the game never left the tree.
    """
    parent_id = 0  # Root nodes have parent_id = 0

    for ply_index, san in enumerate(moves):
        cur.execute(
            "SELECT id, move_san FROM opening_tree WHERE parent_id = %s",
            (parent_id,),
        )
        children = cur.fetchall()

        if not children:
            # Tree has no nodes at this depth — stop tracking, no deviation recorded
            return None

        match = next((row for row in children if row["move_san"] == san), None)

        if match is None:
            move_number = (ply_index // 2) + 1
            deviated_by = "white" if ply_index % 2 == 0 else "black"
            expected = [row["move_san"] for row in children]
            return {
                "deviation_move_number": move_number,
                "deviated_by": deviated_by,
                "game_move": san,
                "expected_moves": expected,
            }

        parent_id = match["id"]

    return None  # Game stayed within the tree the whole way


# ---------------------------------------------------------------------------
# POST /games/upload
# ---------------------------------------------------------------------------

@router.post("/upload", status_code=201)
async def upload_game(file: UploadFile = File(...)):
    pgn_text = (await file.read()).decode("utf-8", errors="replace")
    game = _parse_pgn(pgn_text)

    headers = game.headers
    result = headers.get("Result", "*")
    eco_code = headers.get("ECO", None)
    opening_name = headers.get("Opening", None)
    raw_date = headers.get("Date", None)
    # PGN dates look like "2024.03.15" — normalise to ISO
    game_date = raw_date.replace(".", "-") if raw_date and "?" not in raw_date else None

    moves = _extract_moves(game)

    with get_connection() as conn:
        with conn.cursor() as cur:
            # Insert game
            cur.execute(
                """
                INSERT INTO games (result, eco_code, opening_name, game_date, pgn)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
                """,
                (result, eco_code, opening_name, game_date, pgn_text),
            )
            game_id = cur.fetchone()["id"]

            # Deviation detection
            deviation = _detect_deviation(cur, moves)
            deviation_id = None

            if deviation:
                cur.execute(
                    """
                    INSERT INTO game_deviations (game_id, move_number, move_uci)
                    VALUES (%s, %s, %s)
                    RETURNING id
                    """,
                    (
                        game_id,
                        deviation["deviation_move_number"],
                        deviation["game_move"],
                    ),
                )
                deviation_id = cur.fetchone()["id"]

            conn.commit()

    return {
        "game_id": game_id,
        "deviation_move_number": deviation["deviation_move_number"] if deviation else None,
        "deviated_by": deviation["deviated_by"] if deviation else None,
        "game_move": deviation["game_move"] if deviation else None,
        "expected_moves": deviation["expected_moves"] if deviation else None,
        "deviation_id": deviation_id,
    }


# ---------------------------------------------------------------------------
# GET /games
# ---------------------------------------------------------------------------

@router.get("/")
def get_games():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    g.id,
                    g.result,
                    g.eco_code,
                    g.opening_name,
                    g.game_date,
                    gd.move_number,
                    gd.move_uci,
                    gd.opponent_deviation
                FROM games g
                LEFT JOIN game_deviations gd ON gd.game_id = g.id
                ORDER BY g.id DESC
                """
            )
            return cur.fetchall()


# ---------------------------------------------------------------------------
# GET /games/{id}
# ---------------------------------------------------------------------------

@router.get("/{game_id}")
def get_game(game_id: int):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    g.id,
                    g.result,
                    g.eco_code,
                    g.opening_name,
                    g.game_date,
                    g.pgn,
                    gd.id            AS deviation_id,
                    gd.move_number,
                    gd.move_uci,
                    gd.opponent_deviation,
                    gd.deviation_depth,
                    gd.completion_percentage
                FROM games g
                LEFT JOIN game_deviations gd ON gd.game_id = g.id
                WHERE g.id = %s
                """,
                (game_id,),
            )
            row = cur.fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail="Game not found")
            return row
