import chess
import requests as http

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from db import get_connection
from auth_utils import get_current_user

router = APIRouter(prefix="/openings", tags=["openings"])


class OpeningCreate(BaseModel):
    opening_name: str
    eco_code: str
    moves: str
    color: str  # required — must be "white" or "black"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _validate_color(color: str) -> str:
    """Raise 400 if color is not 'white' or 'black', otherwise return it."""
    if color not in ("white", "black"):
        raise HTTPException(status_code=400, detail="color must be 'white' or 'black'")
    return color


def _opening_table(color: str) -> str:
    return "white_opening" if color == "white" else "black_opening"


def _tree_table(color: str) -> str:
    return "white_opening_tree" if color == "white" else "black_opening_tree"


# ---------------------------------------------------------------------------
# Internal helper — rebuild opening_tree for a user+color from a list of lines
# ---------------------------------------------------------------------------

def _sync_tree(cur, user_id: int, color: str, lines: list):
    """Delete and rebuild the color-specific opening tree for a user from the given lines."""
    tree = _tree_table(color)
    cur.execute(f"DELETE FROM {tree} WHERE user_id = %s", (user_id,))

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
                f"SELECT id FROM {tree} WHERE parent_id = %s AND move_san = %s AND user_id = %s",
                (parent_id, san, user_id),
            )
            row = cur.fetchone()
            if row:
                parent_id = row["id"]
            else:
                cur.execute(
                    f"""
                    INSERT INTO {tree} (parent_id, move_san, opening_name, eco_code, user_id)
                    VALUES (%s, %s, %s, %s, %s) RETURNING id
                    """,
                    (parent_id, san, line["opening_name"], line["eco_code"], user_id),
                )
                parent_id = cur.fetchone()["id"]


# ---------------------------------------------------------------------------
# GET /openings/  — color is required
# ---------------------------------------------------------------------------

@router.get("/")
def get_openings(
    color: str = Query(..., description="'white' or 'black'"),
    current_user: dict = Depends(get_current_user),
):
    color = _validate_color(color)
    table = _opening_table(color)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT * FROM {table} WHERE user_id = %s ORDER BY id",
                (current_user["user_id"],),
            )
            return cur.fetchall()


# ---------------------------------------------------------------------------
# POST /openings/
# ---------------------------------------------------------------------------

@router.post("/", status_code=201)
def create_opening(opening: OpeningCreate, current_user: dict = Depends(get_current_user)):
    color = _validate_color(opening.color)
    user_id = current_user["user_id"]
    table = _opening_table(color)

    with get_connection() as conn:
        with conn.cursor() as cur:
            # Deduplicate: return existing line if same moves already exist for this user+color
            cur.execute(
                f"SELECT * FROM {table} WHERE user_id = %s AND moves = %s",
                (user_id, opening.moves),
            )
            existing = cur.fetchone()
            if existing:
                return existing

            cur.execute(
                f"""
                INSERT INTO {table} (opening_name, eco_code, moves, user_id)
                VALUES (%s, %s, %s, %s)
                RETURNING *
                """,
                (opening.opening_name, opening.eco_code, opening.moves, user_id),
            )
            new_line = cur.fetchone()

            # Rebuild opening_tree for this color (includes the new line)
            cur.execute(
                f"SELECT opening_name, eco_code, moves FROM {table} WHERE user_id = %s",
                (user_id,),
            )
            _sync_tree(cur, user_id, color, cur.fetchall())
            conn.commit()
            return new_line


# ---------------------------------------------------------------------------
# GET /openings/tree  — color is required
# ---------------------------------------------------------------------------

@router.get("/tree")
def get_opening_tree(
    color: str = Query(..., description="'white' or 'black'"),
    current_user: dict = Depends(get_current_user),
):
    """Return the user's opening tree as a nested JSON structure."""
    color = _validate_color(color)
    uid = current_user["user_id"]
    tree = _tree_table(color)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT id, parent_id, move_san, opening_name, eco_code "
                f"FROM {tree} WHERE user_id = %s ORDER BY id",
                (uid,),
            )
            rows = cur.fetchall()

    root = {"name": "start", "id": 0, "children": []}
    if not rows:
        return root

    nodes = {
        r["id"]: {
            "name":         r["move_san"],
            "id":           r["id"],
            "opening_name": r["opening_name"],
            "eco_code":     r["eco_code"],
            "children":     [],
        }
        for r in rows
    }

    for r in rows:
        pid = r["parent_id"]
        node = nodes[r["id"]]
        if pid == 0:
            root["children"].append(node)
        elif pid in nodes:
            nodes[pid]["children"].append(node)

    return root


# ---------------------------------------------------------------------------
# GET /openings/cloud-eval
# ---------------------------------------------------------------------------

_HEADERS = {
    "Accept": "application/json",
    "User-Agent": "chess-analyzer-web/1.0",
}


@router.get("/cloud-eval")
def get_cloud_eval(fen: str, multiPv: int = 1, current_user: dict = Depends(get_current_user)):
    """Proxy Lichess Cloud Eval. multiPv up to 8 returns multiple top moves."""
    try:
        r = http.get(
            "https://lichess.org/api/cloud-eval",
            params={"fen": fen, "multiPv": min(multiPv, 8)},
            headers=_HEADERS,
            timeout=6,
        )
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"[cloud-eval] failed: {e}")
        raise HTTPException(status_code=502, detail=f"Cloud eval unreachable: {e}")


# ---------------------------------------------------------------------------
# DELETE /openings/{opening_id}
# ---------------------------------------------------------------------------

@router.delete("/{opening_id}", status_code=204)
def delete_opening(
    opening_id: int,
    color: str = Query(..., description="'white' or 'black'"),
    current_user: dict = Depends(get_current_user),
):
    color = _validate_color(color)
    user_id = current_user["user_id"]
    table = _opening_table(color)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"DELETE FROM {table} WHERE id = %s AND user_id = %s RETURNING id",
                (opening_id, user_id),
            )
            if cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="Opening not found")

            # Rebuild tree from remaining lines of the same color
            cur.execute(
                f"SELECT opening_name, eco_code, moves FROM {table} WHERE user_id = %s",
                (user_id,),
            )
            _sync_tree(cur, user_id, color, cur.fetchall())
            conn.commit()
