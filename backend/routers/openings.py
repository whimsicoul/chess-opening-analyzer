import chess
import requests as http
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from db import get_connection
from auth_utils import get_current_user

router = APIRouter(prefix="/openings", tags=["openings"])


class OpeningCreate(BaseModel):
    opening_name: str
    eco_code: str
    moves: str
    color: str = "white"


def _opening_table(color: str) -> str:
    """Return the correct storage table for the given color."""
    return "black_opening" if color == "black" else "white_opening"


# ---------------------------------------------------------------------------
# Internal helper — rebuild opening_tree for a user+color from a list of lines
# ---------------------------------------------------------------------------

def _sync_tree(cur, user_id: int, color: str, lines: list):
    """Delete and rebuild opening_tree nodes for user+color from the given lines."""
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
# GET /openings/
# ---------------------------------------------------------------------------

@router.get("/")
def get_openings(color: Optional[str] = Query(None), current_user: dict = Depends(get_current_user)):
    with get_connection() as conn:
        with conn.cursor() as cur:
            if color:
                table = _opening_table(color)
                cur.execute(
                    f"SELECT * FROM {table} WHERE user_id = %s ORDER BY id",
                    (current_user["user_id"],),
                )
            else:
                # Return all lines from both tables
                cur.execute(
                    "SELECT *, 'white' AS color FROM white_opening WHERE user_id = %s"
                    " UNION ALL "
                    "SELECT *, 'black' AS color FROM black_opening WHERE user_id = %s"
                    " ORDER BY id",
                    (current_user["user_id"], current_user["user_id"]),
                )
            return cur.fetchall()


# ---------------------------------------------------------------------------
# POST /openings/
# ---------------------------------------------------------------------------

@router.post("/", status_code=201)
def create_opening(opening: OpeningCreate, current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    table = _opening_table(opening.color)
    with get_connection() as conn:
        with conn.cursor() as cur:
            # Deduplicate: return existing line if same moves already exist for this user
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
            all_lines = cur.fetchall()
            _sync_tree(cur, user_id, opening.color, all_lines)
            conn.commit()
            return new_line


# ---------------------------------------------------------------------------
# GET /openings/tree
# ---------------------------------------------------------------------------

@router.get("/tree")
def get_opening_tree(color: Optional[str] = Query(None), current_user: dict = Depends(get_current_user)):
    """Return the user's opening_tree as a nested JSON structure for the sunburst chart."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            if color:
                cur.execute(
                    "SELECT id, parent_id, move_san, opening_name, eco_code "
                    "FROM opening_tree WHERE user_id = %s AND color = %s ORDER BY id",
                    (current_user["user_id"], color),
                )
            else:
                cur.execute(
                    "SELECT id, parent_id, move_san, opening_name, eco_code "
                    "FROM opening_tree WHERE user_id = %s ORDER BY id",
                    (current_user["user_id"],),
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
# DELETE /openings/{id}
# ---------------------------------------------------------------------------

@router.delete("/{opening_id}", status_code=204)
def delete_opening(opening_id: int, current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    with get_connection() as conn:
        with conn.cursor() as cur:
            # Try white table first, then black
            cur.execute(
                "DELETE FROM white_opening WHERE id = %s AND user_id = %s RETURNING id",
                (opening_id, user_id),
            )
            deleted = cur.fetchone()
            if deleted:
                color = "white"
            else:
                cur.execute(
                    "DELETE FROM black_opening WHERE id = %s AND user_id = %s RETURNING id",
                    (opening_id, user_id),
                )
                deleted = cur.fetchone()
                if deleted is None:
                    raise HTTPException(status_code=404, detail="Opening not found")
                color = "black"

            # Rebuild tree from remaining lines of the same color
            table = _opening_table(color)
            cur.execute(
                f"SELECT opening_name, eco_code, moves FROM {table} WHERE user_id = %s",
                (user_id,),
            )
            remaining = cur.fetchall()
            _sync_tree(cur, user_id, color, remaining)
            conn.commit()
