import os
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
# GET /openings/winrates
# ---------------------------------------------------------------------------

@router.get("/winrates")
def get_opening_winrates(color: str, current_user: dict = Depends(get_current_user)):
    """Return win/draw/loss stats per opening tree node for the given color."""
    import io
    import chess.pgn as cpgn

    uid = current_user["user_id"]
    if color not in ("white", "black"):
        raise HTTPException(status_code=400, detail="color must be 'white' or 'black'")

    tree_table = "white_opening_tree" if color == "white" else "black_opening_tree"

    if tree_table not in {"white_opening_tree", "black_opening_tree"}:
        raise HTTPException(status_code=400, detail="Invalid color")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT id, parent_id, move_san FROM {tree_table} WHERE user_id = %s",
                (uid,),
            )
            rows = cur.fetchall()

            # parent_id -> [(node_id, move_san)]
            children_map: dict[int, list] = {}
            for row in rows:
                pid = row["parent_id"]
                children_map.setdefault(pid, []).append((row["id"], row["move_san"]))

            cur.execute(
                "SELECT pgn, result, opponent_rating FROM games WHERE user_id = %s AND player_color = %s",
                (uid, color),
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
                stats[node_id] = {"wins": 0, "draws": 0, "losses": 0, "rating_sum": 0, "rating_count": 0}
            if win:
                stats[node_id]["wins"] += 1
            elif draw:
                stats[node_id]["draws"] += 1
            else:
                stats[node_id]["losses"] += 1
            if game["opponent_rating"] is not None:
                stats[node_id]["rating_sum"] += game["opponent_rating"]
                stats[node_id]["rating_count"] += 1
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
            "avgOppRating": round(avg_opp_rating) if avg_opp_rating is not None else None,
        }

    return result_map


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
    current_user: dict = Depends(get_current_user),
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
