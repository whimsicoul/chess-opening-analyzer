import chess
import requests as http

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from db import get_connection
from auth_utils import get_current_user

router = APIRouter(prefix="/openings", tags=["openings"])


class OpeningCreate(BaseModel):
    opening_name: str
    eco_code: str
    moves: str


# ---------------------------------------------------------------------------
# Internal helper — rebuild white_opening_tree for a user from a list of lines
# ---------------------------------------------------------------------------

def _sync_tree(cur, user_id: int, lines: list):
    """Delete and rebuild the white opening tree for a user from the given lines."""
    cur.execute("DELETE FROM white_opening_tree WHERE user_id = %s", (user_id,))

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
                "SELECT id FROM white_opening_tree WHERE parent_id = %s AND move_san = %s AND user_id = %s",
                (parent_id, san, user_id),
            )
            row = cur.fetchone()
            if row:
                parent_id = row["id"]
            else:
                cur.execute(
                    """
                    INSERT INTO white_opening_tree (parent_id, move_san, opening_name, eco_code, user_id)
                    VALUES (%s, %s, %s, %s, %s) RETURNING id
                    """,
                    (parent_id, san, line["opening_name"], line["eco_code"], user_id),
                )
                parent_id = cur.fetchone()["id"]


# ---------------------------------------------------------------------------
# GET /openings/
# ---------------------------------------------------------------------------

@router.get("/")
def get_openings(current_user: dict = Depends(get_current_user)):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM white_opening WHERE user_id = %s ORDER BY id",
                (current_user["user_id"],),
            )
            return cur.fetchall()


# ---------------------------------------------------------------------------
# POST /openings/
# ---------------------------------------------------------------------------

@router.post("/", status_code=201)
def create_opening(opening: OpeningCreate, current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]

    with get_connection() as conn:
        with conn.cursor() as cur:
            # Deduplicate: return existing line if same moves already exist for this user
            cur.execute(
                "SELECT * FROM white_opening WHERE user_id = %s AND moves = %s",
                (user_id, opening.moves),
            )
            existing = cur.fetchone()
            if existing:
                return existing

            cur.execute(
                """
                INSERT INTO white_opening (opening_name, eco_code, moves, user_id)
                VALUES (%s, %s, %s, %s)
                RETURNING *
                """,
                (opening.opening_name, opening.eco_code, opening.moves, user_id),
            )
            new_line = cur.fetchone()

            # Rebuild opening tree (includes the new line)
            cur.execute(
                "SELECT opening_name, eco_code, moves FROM white_opening WHERE user_id = %s",
                (user_id,),
            )
            _sync_tree(cur, user_id, cur.fetchall())
            conn.commit()
            return new_line


# ---------------------------------------------------------------------------
# GET /openings/tree
# ---------------------------------------------------------------------------

@router.get("/tree")
def get_opening_tree(current_user: dict = Depends(get_current_user)):
    """Return the user's white opening tree as a nested JSON structure."""
    uid = current_user["user_id"]

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, parent_id, move_san, opening_name, eco_code "
                "FROM white_opening_tree WHERE user_id = %s ORDER BY id",
                (uid,),
            )
            rows = cur.fetchall()

            # Auto-sync: if tree is empty but flat lines exist, rebuild now
            if not rows:
                cur.execute(
                    "SELECT opening_name, eco_code, moves FROM white_opening WHERE user_id = %s",
                    (uid,),
                )
                existing_lines = cur.fetchall()
                if existing_lines:
                    _sync_tree(cur, uid, existing_lines)
                    conn.commit()
                    cur.execute(
                        "SELECT id, parent_id, move_san, opening_name, eco_code "
                        "FROM white_opening_tree WHERE user_id = %s ORDER BY id",
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
# GET /openings/eco-lookup
# ---------------------------------------------------------------------------

@router.get("/eco-lookup")
def get_eco_lookup(fen: str, current_user: dict = Depends(get_current_user)):
    """Look up ECO code and opening name for a position via Lichess Opening Explorer."""
    try:
        r = http.get(
            "https://explorer.lichess.ovh/masters",
            params={"fen": fen, "topGames": 0, "recentGames": 0, "moves": 0},
            headers=_HEADERS,
            timeout=5,
        )
        if r.status_code == 404:
            return None
        r.raise_for_status()
        data = r.json()
        opening = data.get("opening")
        if not opening:
            return None
        return {"eco": opening.get("eco", ""), "name": opening.get("name", "")}
    except Exception as e:
        print(f"[eco-lookup] failed: {e}")
        return None


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
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user_id"]

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM white_opening WHERE id = %s AND user_id = %s RETURNING id",
                (opening_id, user_id),
            )
            if cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="Opening not found")

            # Rebuild tree from remaining lines
            cur.execute(
                "SELECT opening_name, eco_code, moves FROM white_opening WHERE user_id = %s",
                (user_id,),
            )
            _sync_tree(cur, user_id, cur.fetchall())
            conn.commit()
