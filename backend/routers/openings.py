import os
import chess
import requests as http

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from db import get_connection
from owner_utils import Owner, get_owner

router = APIRouter(prefix="/openings", tags=["openings"])


class OpeningCreate(BaseModel):
    opening_name: str
    eco_code: str
    moves: str


# ---------------------------------------------------------------------------
# Internal helper — sync white_opening_tree for a user from their manual lines
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
                f"SELECT id FROM white_opening_tree WHERE parent_id = %s AND move_san = %s AND {owner.clause()}",
                (parent_id, san, owner.value),
            )
            row = cur.fetchone()
            if row:
                parent_id = row["id"]
            else:
                cur.execute(
                    """
                    INSERT INTO white_opening_tree (parent_id, move_san, opening_name, eco_code, user_id, guest_id, source)
                    VALUES (%s, %s, %s, %s, %s, %s, 'manual') RETURNING id
                    """,
                    (parent_id, san, line["opening_name"], line["eco_code"], owner.user_id, owner.guest_id),
                )
                parent_id = cur.fetchone()["id"]
            kept_ids.add(parent_id)

    # Prune manual-source nodes no longer on any current manual line. A single
    # pass suffices: orphans are identified against the full manual node set
    # up front, so a parent and its now-unreachable children are all deleted
    # together regardless of ON DELETE CASCADE ordering.
    cur.execute(
        f"SELECT id FROM white_opening_tree WHERE {owner.clause()} AND source = 'manual'",
        (owner.value,),
    )
    manual_ids = [r["id"] for r in cur.fetchall()]
    orphans = [nid for nid in manual_ids if nid not in kept_ids]
    if orphans:
        cur.execute(
            f"DELETE FROM white_opening_tree WHERE id = ANY(%s) AND {owner.clause()}",
            (orphans, owner.value),
        )


# ---------------------------------------------------------------------------
# GET /openings/
# ---------------------------------------------------------------------------

@router.get("/")
def get_openings(owner: Owner = Depends(get_owner)):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT * FROM white_opening WHERE {owner.clause()} ORDER BY id",
                (owner.value,),
            )
            return cur.fetchall()


# ---------------------------------------------------------------------------
# GET /openings/status
# ---------------------------------------------------------------------------

@router.get("/status")
def get_status(owner: Owner = Depends(get_owner)):
    """Return games-based repertoire build metadata for the white tree, if any."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT built_at, games_count FROM repertoire_builds WHERE {owner.clause()} AND color = 'white'",
                (owner.value,),
            )
            row = cur.fetchone()
    return row or {"built_at": None, "games_count": None}


# ---------------------------------------------------------------------------
# POST /openings/
# ---------------------------------------------------------------------------

@router.post("/", status_code=201)
def create_opening(opening: OpeningCreate, owner: Owner = Depends(get_owner)):
    with get_connection() as conn:
        with conn.cursor() as cur:
            # Deduplicate: return existing line if same moves already exist for this user
            cur.execute(
                f"SELECT * FROM white_opening WHERE {owner.clause()} AND moves = %s",
                (owner.value, opening.moves),
            )
            existing = cur.fetchone()
            if existing:
                return existing

            cur.execute(
                """
                INSERT INTO white_opening (opening_name, eco_code, moves, user_id, guest_id)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING *
                """,
                (opening.opening_name, opening.eco_code, opening.moves, owner.user_id, owner.guest_id),
            )
            new_line = cur.fetchone()

            # Rebuild opening tree (includes the new line)
            cur.execute(
                f"SELECT opening_name, eco_code, moves FROM white_opening WHERE {owner.clause()}",
                (owner.value,),
            )
            _sync_tree(cur, owner, cur.fetchall())
            conn.commit()
            return new_line


# ---------------------------------------------------------------------------
# GET /openings/tree
# ---------------------------------------------------------------------------

@router.get("/tree")
def get_opening_tree(owner: Owner = Depends(get_owner)):
    """Return the user's white opening tree as a nested JSON structure."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT id, parent_id, move_san, opening_name, eco_code "
                f"FROM white_opening_tree WHERE {owner.clause()} ORDER BY id",
                (owner.value,),
            )
            rows = cur.fetchall()

            # Auto-sync: if tree is empty but flat lines exist, rebuild now
            if not rows:
                cur.execute(
                    f"SELECT opening_name, eco_code, moves FROM white_opening WHERE {owner.clause()}",
                    (owner.value,),
                )
                existing_lines = cur.fetchall()
                if existing_lines:
                    _sync_tree(cur, owner, existing_lines)
                    conn.commit()
                    cur.execute(
                        f"SELECT id, parent_id, move_san, opening_name, eco_code "
                        f"FROM white_opening_tree WHERE {owner.clause()} ORDER BY id",
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
# GET /openings/winrates & GET /openings/weaknesses — shared computation
# ---------------------------------------------------------------------------

def _compute_winrates(cur, owner: Owner, color: str) -> tuple[dict[int, dict], dict[int, dict]]:
    """Return (stats_by_node_id, node_by_id) — win/draw/loss stats and tree
    node metadata (id, parent_id, move_san) for the given owner/color."""
    import io
    import chess.pgn as cpgn

    tree_table = "white_opening_tree" if color == "white" else "black_opening_tree"

    cur.execute(
        f"SELECT id, parent_id, move_san FROM {tree_table} WHERE {owner.clause()}",
        (owner.value,),
    )
    rows = cur.fetchall()
    node_by_id = {r["id"]: r for r in rows}

    # parent_id -> [(node_id, move_san)]
    children_map: dict[int, list] = {}
    for row in rows:
        pid = row["parent_id"]
        children_map.setdefault(pid, []).append((row["id"], row["move_san"]))

    cur.execute(
        f"SELECT pgn, result, opponent_rating, game_date FROM games WHERE {owner.clause()} AND player_color = %s",
        (owner.value, color),
    )
    games = cur.fetchall()

    stats: dict[int, dict] = {}

    for game in games:
        result = game["result"]
        if not result or result == "*":
            continue

        win  = (color == "white" and result == "1-0") or (color == "black" and result == "0-1")
        draw = result == "1/2-1/2"

        g = cpgn.read_game(io.StringIO(game["pgn"]))
        if g is None:
            continue

        board = g.board()
        parent_id = 0
        for move in g.mainline_moves():
            san = board.san(move)
            board.push(move)

            match = next((c for c in children_map.get(parent_id, []) if c[1] == san), None)
            if not match:
                break

            node_id = match[0]
            if node_id not in stats:
                stats[node_id] = {
                    "wins": 0, "draws": 0, "losses": 0,
                    "rating_sum": 0, "rating_count": 0,
                    "rating_min": None, "rating_max": None,
                    "last_played": None,
                }
            s = stats[node_id]
            if win:
                s["wins"] += 1
            elif draw:
                s["draws"] += 1
            else:
                s["losses"] += 1
            rating = game["opponent_rating"]
            if rating is not None:
                s["rating_sum"] += rating
                s["rating_count"] += 1
                s["rating_min"] = rating if s["rating_min"] is None else min(s["rating_min"], rating)
                s["rating_max"] = rating if s["rating_max"] is None else max(s["rating_max"], rating)
            played_on = game["game_date"]
            if played_on is not None:
                if s["last_played"] is None or played_on > s["last_played"]:
                    s["last_played"] = played_on
            parent_id = node_id

    result_map = {}
    for node_id, s in stats.items():
        total = s["wins"] + s["draws"] + s["losses"]
        avg_opp_rating = (s["rating_sum"] / s["rating_count"]) if s["rating_count"] > 0 else None
        result_map[node_id] = {
            "wins": s["wins"],
            "draws": s["draws"],
            "losses": s["losses"],
            "total": total,
            "winRate": s["wins"] / total * 100,
            # Draws count as half a win rather than a loss, so an all-draws
            # line scores neutral (50%) instead of reading as maximally weak.
            "score": (s["wins"] + 0.5 * s["draws"]) / total * 100,
            "avgOppRating": round(avg_opp_rating) if avg_opp_rating is not None else None,
            "ratingMin": s["rating_min"],
            "ratingMax": s["rating_max"],
            "lastPlayed": s["last_played"].isoformat() if s["last_played"] is not None else None,
        }

    return result_map, node_by_id


def _reconstruct_path(node_by_id: dict, node_id: int) -> list[str]:
    """Walk parent_id links back to the root, returning SAN moves in play order."""
    path = []
    current = node_by_id.get(node_id)
    while current is not None:
        path.append(current["move_san"])
        current = node_by_id.get(current["parent_id"])
    path.reverse()
    return path


@router.get("/winrates")
def get_opening_winrates(color: str, owner: Owner = Depends(get_owner)):
    """Return win/draw/loss stats per opening tree node for the given color."""
    if color not in ("white", "black"):
        raise HTTPException(status_code=400, detail="color must be 'white' or 'black'")

    with get_connection() as conn:
        with conn.cursor() as cur:
            result_map, _ = _compute_winrates(cur, owner, color)

    return result_map


# ---------------------------------------------------------------------------
# GET /openings/weaknesses
# ---------------------------------------------------------------------------

@router.get("/weaknesses")
def get_weaknesses(
    color: str,
    min_games: int = 5,
    max_win_rate: float = 45.0,
    owner: Owner = Depends(get_owner),
):
    """Return opening tree nodes with a low score (wins + half of draws over
    total), above a minimum sample size. `max_win_rate` filters on `score`,
    not pure win rate, so draw-heavy lines aren't flagged as weak."""
    if color not in ("white", "black"):
        raise HTTPException(status_code=400, detail="color must be 'white' or 'black'")

    with get_connection() as conn:
        with conn.cursor() as cur:
            stats, node_by_id = _compute_winrates(cur, owner, color)

    weak = [
        {
            **s,
            "node_id": node_id,
            "move_san": node_by_id[node_id]["move_san"],
            "path": _reconstruct_path(node_by_id, node_id),
        }
        for node_id, s in stats.items()
        if s["total"] >= min_games and s["score"] < max_win_rate
    ]
    weak.sort(key=lambda w: w["score"])
    return weak


# ---------------------------------------------------------------------------
# POST /openings/rebuild
# ---------------------------------------------------------------------------

@router.post("/rebuild")
def rebuild_from_games(background_tasks: BackgroundTasks, owner: Owner = Depends(get_owner)):
    """Force a games-based rebuild of the white opening tree. Additive — never
    deletes manually-added lines."""
    from routers.repertoire_builder import build_tree_from_games
    from motif_cache import precompute_for_owner_tree

    with get_connection() as conn:
        with conn.cursor() as cur:
            result = build_tree_from_games(cur, owner, "white")
        conn.commit()
    background_tasks.add_task(precompute_for_owner_tree, owner, "white")
    return result


# ---------------------------------------------------------------------------
# GET /openings/eco-lookup
# ---------------------------------------------------------------------------

@router.get("/eco-lookup")
def get_eco_lookup(fen: str):
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

_LICHESS_TOKEN = os.getenv("LICHESS_TOKEN", "")

_HEADERS = {
    "Accept": "application/json",
    "User-Agent": "chess-analyzer-web/1.0",
    **( {"Authorization": f"Bearer {_LICHESS_TOKEN}"} if _LICHESS_TOKEN else {} ),
}


@router.get("/explorer")
def get_explorer(
    fen: str,
    source: str = "masters",
    ratings: str = "1600,1800,2000,2200,2500",
    speeds: str = "rapid,classical,blitz",
):
    """Proxy Lichess Opening Explorer. source='masters' or 'lichess'."""
    if source == "masters":
        url = "https://explorer.lichess.ovh/masters"
        params = {"fen": fen, "moves": 10, "topGames": 0, "recentGames": 0}
    else:
        import urllib.parse
        url = (
            f"https://explorer.lichess.ovh/lichess"
            f"?fen={urllib.parse.quote(fen, safe='')}"
            f"&ratings={ratings}&speeds={speeds}"
            f"&moves=10&topGames=0&recentGames=0"
        )
        params = None
    try:
        r = http.get(url, params=params, headers=_HEADERS, timeout=6)
        print(f"[explorer] {source} status={r.status_code} url={r.url}")
        if r.status_code == 404:
            return None
        if not r.ok:
            print(f"[explorer] error body: {r.text[:300]}")
            r.raise_for_status()
        data = r.json()
        print(f"[explorer] {source} moves={len(data.get('moves', []))}")
        return {
            "opening": data.get("opening"),
            "moves": [
                {
                    "uci": m.get("uci"),
                    "san": m.get("san"),
                    "white": m.get("white", 0),
                    "draws": m.get("draws", 0),
                    "black": m.get("black", 0),
                    "averageRating": m.get("averageRating"),
                }
                for m in data.get("moves", [])
            ],
        }
    except Exception as e:
        print(f"[explorer] failed: {e}")
        return None


@router.get("/cloud-eval")
def get_cloud_eval(fen: str, multiPv: int = 1):
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
# DELETE /openings/ — clear the entire white repertoire
# ---------------------------------------------------------------------------

@router.delete("/", status_code=204)
def clear_openings(owner: Owner = Depends(get_owner)):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"DELETE FROM white_opening WHERE {owner.clause()}", (owner.value,))
            cur.execute(f"DELETE FROM white_opening_tree WHERE {owner.clause()}", (owner.value,))
            cur.execute(
                f"DELETE FROM repertoire_builds WHERE {owner.clause()} AND color = 'white'",
                (owner.value,),
            )
            conn.commit()


# ---------------------------------------------------------------------------
# DELETE /openings/{opening_id}
# ---------------------------------------------------------------------------

@router.delete("/{opening_id}", status_code=204)
def delete_opening(
    opening_id: int,
    owner: Owner = Depends(get_owner),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"DELETE FROM white_opening WHERE id = %s AND {owner.clause()} RETURNING id",
                (opening_id, owner.value),
            )
            if cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="Opening not found")

            # Rebuild tree from remaining lines
            cur.execute(
                f"SELECT opening_name, eco_code, moves FROM white_opening WHERE {owner.clause()}",
                (owner.value,),
            )
            _sync_tree(cur, owner, cur.fetchall())
            conn.commit()
