import io
import re
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
import chess.pgn
from db import get_connection
from auth_utils import get_current_user


def _pgn_tag(pgn_text: str, tag: str) -> str | None:
    """Extract a single PGN header tag value using regex, e.g. [White "name"]."""
    m = re.search(r'\[' + tag + r'\s+"([^"]*)"\]', pgn_text)
    return m.group(1) if m else None

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


def _detect_player_color(white: str, black: str, username: str | None) -> str | None:
    if not username:
        return None
    if white.lower() == username.lower():
        return "white"
    if black.lower() == username.lower():
        return "black"
    return None


def _detect_deviation(cur, moves: list[str], user_id: int, color: str | None = None) -> dict | None:
    """
    Walk the opening_tree following the game's moves (scoped to user_id and color).
    opening_tree schema: id, parent_id, move_san, opening_name, eco_code, user_id, color
    Root nodes have parent_id = 0.
    Returns dict with deviation_move_number, deviated_by, game_move, expected_moves
    or None if the game never left the tree.
    """
    parent_id = 0

    for ply_index, san in enumerate(moves):
        if color:
            cur.execute(
                "SELECT id, move_san FROM opening_tree WHERE parent_id = %s AND user_id = %s AND color = %s",
                (parent_id, user_id, color),
            )
        else:
            cur.execute(
                "SELECT id, move_san FROM opening_tree WHERE parent_id = %s AND user_id = %s",
                (parent_id, user_id),
            )
        children = cur.fetchall()

        if not children:
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

    return None


def _process_pgn(cur, pgn_text: str, username: str | None, user_id: int) -> dict:
    """Parse a PGN, insert into games + game_deviations, return insert result."""
    game = _parse_pgn(pgn_text)

    headers = game.headers
    result   = headers.get("Result", "*")
    eco_code = headers.get("ECO", None)
    raw_date = headers.get("Date", None)
    game_date = raw_date.replace(".", "-") if raw_date and "?" not in raw_date else None

    opening_name = _pgn_tag(pgn_text, "Opening")
    white        = _pgn_tag(pgn_text, "White") or ""
    black        = _pgn_tag(pgn_text, "Black") or ""

    player_color = _detect_player_color(white, black, username)

    moves = _extract_moves(game)

    cur.execute(
        """
        INSERT INTO games (result, eco_code, opening_name, game_date, pgn,
                           player_color, white_player, black_player, user_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (result, eco_code, opening_name, game_date, pgn_text,
         player_color, white or None, black or None, user_id),
    )
    game_id = cur.fetchone()["id"]

    deviation = _detect_deviation(cur, moves, user_id, player_color)
    deviation_id = None

    if deviation:
        opponent_deviation = None
        if player_color:
            opponent_deviation = (deviation["deviated_by"] != player_color)

        cur.execute(
            """
            INSERT INTO game_deviations (game_id, move_number, move_uci, opponent_deviation)
            VALUES (%s, %s, %s, %s)
            RETURNING id
            """,
            (game_id, deviation["deviation_move_number"], deviation["game_move"], opponent_deviation),
        )
        deviation_id = cur.fetchone()["id"]

    return {
        "game_id": game_id,
        "deviation_move_number": deviation["deviation_move_number"] if deviation else None,
        "deviated_by": deviation["deviated_by"] if deviation else None,
        "game_move": deviation["game_move"] if deviation else None,
        "expected_moves": deviation["expected_moves"] if deviation else None,
        "deviation_id": deviation_id,
    }


# ---------------------------------------------------------------------------
# POST /games/upload
# ---------------------------------------------------------------------------

@router.post("/upload", status_code=201)
async def upload_game(
    file: UploadFile = File(...),
    username: str = Form(None),
    current_user: dict = Depends(get_current_user),
):
    pgn_text = (await file.read()).decode("utf-8", errors="replace")
    with get_connection() as conn:
        with conn.cursor() as cur:
            result = _process_pgn(cur, pgn_text, username, current_user["user_id"])
        conn.commit()
    return result


# ---------------------------------------------------------------------------
# POST /games/import
# ---------------------------------------------------------------------------

class ImportRequest(BaseModel):
    pgns: list[str]
    username: str


@router.post("/import", status_code=201)
def import_games(payload: ImportRequest, current_user: dict = Depends(get_current_user)):
    imported = 0
    errors = []
    with get_connection() as conn:
        with conn.cursor() as cur:
            for i, pgn_text in enumerate(payload.pgns):
                try:
                    _process_pgn(cur, pgn_text, payload.username, current_user["user_id"])
                    imported += 1
                except Exception as e:
                    errors.append({"index": i, "message": str(e)})
        conn.commit()
    return {"imported": imported, "errors": errors}


# ---------------------------------------------------------------------------
# DELETE /games/
# ---------------------------------------------------------------------------

@router.delete("/")
def clear_games(current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM game_deviations WHERE game_id IN (SELECT id FROM games WHERE user_id = %s)",
                (user_id,),
            )
            cur.execute("DELETE FROM games WHERE user_id = %s", (user_id,))
        conn.commit()
    return {"deleted": True}


# ---------------------------------------------------------------------------
# GET /games
# ---------------------------------------------------------------------------

@router.get("/")
def get_games(current_user: dict = Depends(get_current_user)):
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
                    g.player_color,
                    g.white_player,
                    g.black_player,
                    gd.move_number,
                    gd.move_uci,
                    gd.opponent_deviation
                FROM games g
                LEFT JOIN game_deviations gd ON gd.game_id = g.id
                WHERE g.user_id = %s
                ORDER BY g.id DESC
                """,
                (current_user["user_id"],),
            )
            return cur.fetchall()


# ---------------------------------------------------------------------------
# GET /games/{id}
# ---------------------------------------------------------------------------

@router.get("/{game_id}")
def get_game(game_id: int, current_user: dict = Depends(get_current_user)):
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
                    g.player_color,
                    g.white_player,
                    g.black_player,
                    gd.id            AS deviation_id,
                    gd.move_number,
                    gd.move_uci,
                    gd.opponent_deviation,
                    gd.deviation_depth,
                    gd.completion_percentage
                FROM games g
                LEFT JOIN game_deviations gd ON gd.game_id = g.id
                WHERE g.id = %s AND g.user_id = %s
                """,
                (game_id, current_user["user_id"]),
            )
            row = cur.fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail="Game not found")
            return row
