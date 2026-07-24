import chess
import traceback

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from db import get_connection
from owner_utils import Owner, get_owner

router = APIRouter(prefix="/openings/black", tags=["black-openings"])


class OpeningCreate(BaseModel):
    opening_name: str
    eco_code: str
    moves: str


# ---------------------------------------------------------------------------
# Internal helper — rebuild black_opening_tree for a user from a list of lines
# ---------------------------------------------------------------------------

def _sync_tree(cur, owner: Owner, lines: list):
    """Insert/update tree nodes for the given manual lines, then prune any
    manual-source node no longer covered by any of them. Games-derived nodes
    (source='games') are never touched here — manual and games-derived trees
    coexist by union."""
    kept_ids: set[int] = set()

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
                f"SELECT id FROM black_opening_tree WHERE parent_id = %s AND move_san = %s AND {owner.clause()}",
                (parent_id, san, owner.value),
            )
            row = cur.fetchone()
            if row:
                parent_id = row["id"]
            else:
                cur.execute(
                    """
                    INSERT INTO black_opening_tree (parent_id, move_san, opening_name, eco_code, user_id, guest_id, source)
                    VALUES (%s, %s, %s, %s, %s, %s, 'manual') RETURNING id
                    """,
                    (parent_id, san, line["opening_name"], line["eco_code"], owner.user_id, owner.guest_id),
                )
                parent_id = cur.fetchone()["id"]
            kept_ids.add(parent_id)

    cur.execute(
        f"SELECT id FROM black_opening_tree WHERE {owner.clause()} AND source = 'manual'",
        (owner.value,),
    )
    manual_ids = [r["id"] for r in cur.fetchall()]
    orphans = [nid for nid in manual_ids if nid not in kept_ids]
    if orphans:
        cur.execute(
            f"DELETE FROM black_opening_tree WHERE id = ANY(%s) AND {owner.clause()}",
            (orphans, owner.value),
        )


# ---------------------------------------------------------------------------
# GET /openings/black/
# ---------------------------------------------------------------------------

@router.get("/")
def get_openings(owner: Owner = Depends(get_owner)):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT * FROM black_opening WHERE {owner.clause()} ORDER BY id",
                (owner.value,),
            )
            return cur.fetchall()


# ---------------------------------------------------------------------------
# GET /openings/black/status
# ---------------------------------------------------------------------------

@router.get("/status")
def get_status(owner: Owner = Depends(get_owner)):
    """Return games-based repertoire build metadata for the black tree, if any."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT built_at, games_count FROM repertoire_builds WHERE {owner.clause()} AND color = 'black'",
                (owner.value,),
            )
            row = cur.fetchone()
    return row or {"built_at": None, "games_count": None}


# ---------------------------------------------------------------------------
# POST /openings/black/
# ---------------------------------------------------------------------------

@router.post("/", status_code=201)
def create_opening(opening: OpeningCreate, owner: Owner = Depends(get_owner)):
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                # Deduplicate: return existing line if same moves already exist for this user
                cur.execute(
                    f"SELECT * FROM black_opening WHERE {owner.clause()} AND moves = %s",
                    (owner.value, opening.moves),
                )
                existing = cur.fetchone()
                if existing:
                    return existing

                cur.execute(
                    """
                    INSERT INTO black_opening (opening_name, eco_code, moves, user_id, guest_id)
                    VALUES (%s, %s, %s, %s, %s)
                    RETURNING *
                    """,
                    (opening.opening_name, opening.eco_code, opening.moves, owner.user_id, owner.guest_id),
                )
                new_line = cur.fetchone()

                # Rebuild opening tree (includes the new line)
                cur.execute(
                    f"SELECT opening_name, eco_code, moves FROM black_opening WHERE {owner.clause()}",
                    (owner.value,),
                )
                _sync_tree(cur, owner, cur.fetchall())
                conn.commit()
                return new_line
    except Exception as e:
        print(f"[black create_opening] ERROR: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# GET /openings/black/tree
# ---------------------------------------------------------------------------

@router.get("/tree")
def get_opening_tree(owner: Owner = Depends(get_owner)):
    """Return the user's black opening tree as a nested JSON structure."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT id, parent_id, move_san, opening_name, eco_code "
                f"FROM black_opening_tree WHERE {owner.clause()} ORDER BY id",
                (owner.value,),
            )
            rows = cur.fetchall()

            # Auto-sync: if tree is empty but flat lines exist, rebuild now
            if not rows:
                cur.execute(
                    f"SELECT opening_name, eco_code, moves FROM black_opening WHERE {owner.clause()}",
                    (owner.value,),
                )
                existing_lines = cur.fetchall()
                if existing_lines:
                    _sync_tree(cur, owner, existing_lines)
                    conn.commit()
                    cur.execute(
                        f"SELECT id, parent_id, move_san, opening_name, eco_code "
                        f"FROM black_opening_tree WHERE {owner.clause()} ORDER BY id",
                        (owner.value,),
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
# POST /openings/black/rebuild
# ---------------------------------------------------------------------------

@router.post("/rebuild")
def rebuild_from_games(background_tasks: BackgroundTasks, owner: Owner = Depends(get_owner)):
    """Force a games-based rebuild of the black opening tree. Additive — never
    deletes manually-added lines."""
    from routers.repertoire_builder import build_tree_from_games
    from motif_cache import precompute_for_owner_tree

    with get_connection() as conn:
        with conn.cursor() as cur:
            result = build_tree_from_games(cur, owner, "black")
        conn.commit()
    background_tasks.add_task(precompute_for_owner_tree, owner, "black")
    return result


# ---------------------------------------------------------------------------
# DELETE /openings/black/ — clear the entire black repertoire
# ---------------------------------------------------------------------------

@router.delete("/", status_code=204)
def clear_openings(owner: Owner = Depends(get_owner)):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"DELETE FROM black_opening WHERE {owner.clause()}", (owner.value,))
            cur.execute(f"DELETE FROM black_opening_tree WHERE {owner.clause()}", (owner.value,))
            cur.execute(
                f"DELETE FROM repertoire_builds WHERE {owner.clause()} AND color = 'black'",
                (owner.value,),
            )
            conn.commit()


# ---------------------------------------------------------------------------
# DELETE /openings/black/{opening_id}
# ---------------------------------------------------------------------------

@router.delete("/{opening_id}", status_code=204)
def delete_opening(
    opening_id: int,
    owner: Owner = Depends(get_owner),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"DELETE FROM black_opening WHERE id = %s AND {owner.clause()} RETURNING id",
                (opening_id, owner.value),
            )
            if cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="Opening not found")

            # Rebuild tree from remaining lines
            cur.execute(
                f"SELECT opening_name, eco_code, moves FROM black_opening WHERE {owner.clause()}",
                (owner.value,),
            )
            _sync_tree(cur, owner, cur.fetchall())
            conn.commit()
