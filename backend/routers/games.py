import io
import re
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
import chess.pgn
from db import get_connection
from owner_utils import Owner, get_owner


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


def _parse_elo(s: str | None) -> int | None:
    try:
        v = int(s)
        return v if v > 0 else None
    except (TypeError, ValueError):
        return None


def _detect_player_color(white: str, black: str, username: str | None) -> str | None:
    if not username:
        return None
    if white.lower() == username.lower():
        return "white"
    if black.lower() == username.lower():
        return "black"
    return None


def _resolve_player_color(cur, white: str, black: str, username: str | None, owner: Owner) -> str | None:
    """Try the explicit per-request username override first, then — only for
    logged-in users — fall back to the account's stored platform usernames.
    Guests have no users row to look up, so they must always pass an
    explicit username from the frontend."""
    color = _detect_player_color(white, black, username)
    if color:
        return color

    if owner.user_id is None:
        return None

    cur.execute(
        "SELECT lichess_username, chesscom_username FROM users WHERE id = %s",
        (owner.user_id,),
    )
    row = cur.fetchone() or {}
    for candidate in (row.get("lichess_username"), row.get("chesscom_username")):
        color = _detect_player_color(white, black, candidate)
        if color:
            return color
    return None


def _detect_deviation(cur, moves: list[str], owner: Owner, color: str | None = None) -> dict | None:
    """
    Walk the opening tree following the game's moves (scoped to owner and color).
    Uses white_opening_tree or black_opening_tree depending on player color.
    Root nodes have parent_id = 0.
    Returns dict with deviation_move_number, deviated_by, game_move, expected_moves
    or None if the game never left the tree.
    """
    if color == "white":
        table = "white_opening_tree"
    elif color == "black":
        table = "black_opening_tree"
    else:
        return None

    if table not in {"white_opening_tree", "black_opening_tree"}:
        return None

    parent_id = 0

    for ply_index, san in enumerate(moves):
        cur.execute(
            f"SELECT id, move_san FROM {table} WHERE parent_id = %s AND {owner.clause()}",
            (parent_id, owner.value),
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


def _process_pgn(cur, pgn_text: str, username: str | None, owner: Owner) -> dict:
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

    player_color = _resolve_player_color(cur, white, black, username, owner)

    white_elo = _parse_elo(_pgn_tag(pgn_text, "WhiteElo"))
    black_elo = _parse_elo(_pgn_tag(pgn_text, "BlackElo"))
    if player_color == "white":
        opponent_rating = black_elo
    elif player_color == "black":
        opponent_rating = white_elo
    else:
        opponent_rating = None

    moves = _extract_moves(game)

    cur.execute(
        """
        INSERT INTO games (result, eco_code, opening_name, game_date, pgn,
                           player_color, white_player, black_player, user_id, guest_id, opponent_rating)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (result, eco_code, opening_name, game_date, pgn_text,
         player_color, white or None, black or None, owner.user_id, owner.guest_id, opponent_rating),
    )
    game_id = cur.fetchone()["id"]

    deviation = _detect_deviation(cur, moves, owner, player_color)
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
        "player_color": player_color,
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
    owner: Owner = Depends(get_owner),
):
    from routers.repertoire_builder import build_tree_from_games

    pgn_text = (await file.read()).decode("utf-8", errors="replace")
    with get_connection() as conn:
        with conn.cursor() as cur:
            result = _process_pgn(cur, pgn_text, username, owner)
            player_color = result.get("player_color")
            if player_color:
                build_tree_from_games(cur, owner, player_color)
        conn.commit()
    return result


# ---------------------------------------------------------------------------
# POST /games/import
# ---------------------------------------------------------------------------

class ImportRequest(BaseModel):
    pgns: list[str]
    username: str | None = None


@router.post("/import", status_code=201)
def import_games(payload: ImportRequest, owner: Owner = Depends(get_owner)):
    from routers.repertoire_builder import build_tree_from_games

    imported = 0
    errors = []
    colors_seen: set[str] = set()
    with get_connection() as conn:
        with conn.cursor() as cur:
            for i, pgn_text in enumerate(payload.pgns):
                try:
                    result = _process_pgn(cur, pgn_text, payload.username, owner)
                    imported += 1
                    if result.get("player_color"):
                        colors_seen.add(result["player_color"])
                except Exception as e:
                    errors.append({"index": i, "message": str(e)})

            repertoire_rebuilt = {}
            for color in colors_seen:
                repertoire_rebuilt[color] = build_tree_from_games(cur, owner, color)
        conn.commit()
    return {"imported": imported, "errors": errors, "repertoire_rebuilt": repertoire_rebuilt}


# ---------------------------------------------------------------------------
# DELETE /games/
# ---------------------------------------------------------------------------

@router.delete("/")
def clear_games(owner: Owner = Depends(get_owner)):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"DELETE FROM game_deviations WHERE game_id IN (SELECT id FROM games WHERE {owner.clause()})",
                (owner.value,),
            )
            cur.execute(f"DELETE FROM games WHERE {owner.clause()}", (owner.value,))
        conn.commit()
    return {"deleted": True}


# ---------------------------------------------------------------------------
# GET /games
# ---------------------------------------------------------------------------

@router.get("/")
def get_games(owner: Owner = Depends(get_owner)):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT
                    g.id,
                    g.result,
                    g.eco_code,
                    g.opening_name,
                    g.game_date,
                    g.player_color,
                    g.white_player,
                    g.black_player,
                    g.opponent_rating,
                    gd.move_number,
                    gd.move_uci,
                    gd.opponent_deviation
                FROM games g
                LEFT JOIN game_deviations gd ON gd.game_id = g.id
                WHERE {owner.clause('g')}
                ORDER BY g.id DESC
                """,
                (owner.value,),
            )
            return cur.fetchall()


# ---------------------------------------------------------------------------
# POST /games/reprocess
# ---------------------------------------------------------------------------

@router.post("/reprocess")
def reprocess_deviations(owner: Owner = Depends(get_owner)):
    """Re-detect deviations for all user games using the current opening repertoire."""
    reprocessed = 0
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT id, pgn, player_color FROM games WHERE {owner.clause()}",
                (owner.value,),
            )
            rows = cur.fetchall()
            for row in rows:
                game_id = row["id"]
                pgn_text = row["pgn"]
                player_color = row["player_color"]
                try:
                    game = _parse_pgn(pgn_text)
                    moves = _extract_moves(game)
                    deviation = _detect_deviation(cur, moves, owner, player_color)

                    cur.execute(
                        "DELETE FROM game_deviations WHERE game_id = %s", (game_id,)
                    )

                    if deviation:
                        opponent_deviation = None
                        if player_color:
                            opponent_deviation = (deviation["deviated_by"] != player_color)
                        cur.execute(
                            """
                            INSERT INTO game_deviations (game_id, move_number, move_uci, opponent_deviation)
                            VALUES (%s, %s, %s, %s)
                            """,
                            (game_id, deviation["deviation_move_number"], deviation["game_move"], opponent_deviation),
                        )
                    reprocessed += 1
                except Exception:
                    pass
        conn.commit()
    return {"reprocessed": reprocessed}


# ---------------------------------------------------------------------------
# GET /games/{id}
# ---------------------------------------------------------------------------

@router.get("/{game_id}")
def get_game(game_id: int, owner: Owner = Depends(get_owner)):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
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
                WHERE g.id = %s AND {owner.clause('g')}
                """,
                (game_id, owner.value),
            )
            row = cur.fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail="Game not found")
            return row
