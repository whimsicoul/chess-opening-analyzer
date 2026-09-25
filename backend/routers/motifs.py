"""Repertoire 'Ideas' panel: your stats + structural facts + retrieved/
synthesized plans for a given position. See CLAUDE.md 'Repertoire -> Ideas
panel' and motif_cache.py for the caching/generation pipeline.

Plans are LLM-synthesized (see motif_cache._synthesize_plans) and cost real
money per call. To keep that spend bounded and predictable, this endpoint
never triggers generation itself — it only reads whatever the background
"Rebuild from Games" precompute pass has already cached
(motif_cache.precompute_for_owner_tree). An uncached position still returns
structure (cheap, deterministic) with empty plans rather than erroring, so
the panel degrades gracefully instead of silently costing money on every
novel FEN a client can request.
"""

import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException

from db import get_connection
from owner_utils import Owner, get_owner
from motif_cache import get_cached_motifs, san_path_to_fen
from routers.openings import _compute_winrates, _reconstruct_path

router = APIRouter(prefix="/motifs", tags=["motifs"])

# Simple in-process rate limit, keyed by owner. Defense-in-depth alongside
# the precompute-only restriction above: bounds how fast any single
# user/guest can hammer this (or a future on-demand-generation) endpoint.
# In-process is fine for this project's single-instance Railway deploy; a
# multi-instance deploy would need a shared store (e.g. Redis) instead.
_RATE_LIMIT_MAX_REQUESTS = 30
_RATE_LIMIT_WINDOW_SECONDS = 60
_request_log: dict[str, list[float]] = defaultdict(list)


def _check_rate_limit(owner: Owner) -> None:
    key = f"{owner.column}:{owner.value}"
    now = time.monotonic()
    window_start = now - _RATE_LIMIT_WINDOW_SECONDS
    recent = [t for t in _request_log[key] if t > window_start]
    if len(recent) >= _RATE_LIMIT_MAX_REQUESTS:
        raise HTTPException(status_code=429, detail="Too many requests — please slow down")
    recent.append(now)
    _request_log[key] = recent


def _stats_for_path(cur, owner: Owner, color: str, san_path: list[str]) -> dict | None:
    """Your stats for this exact position, plus what the tree's main
    (most-played-among-siblings) continuation was at each prior node — the
    'you play X, main line is Y' comparison. Returns None if the position
    isn't reachable in the owner's tree (e.g. an off-tree/manual FEN) rather
    than guessing partial stats."""
    tree_table = "white_opening_tree" if color == "white" else "black_opening_tree"
    cur.execute(
        f"SELECT id, parent_id, move_san FROM {tree_table} WHERE {owner.clause()}",
        (owner.value,),
    )
    rows = cur.fetchall()
    children_map: dict[int, list] = {}
    for row in rows:
        children_map.setdefault(row["parent_id"], []).append((row["id"], row["move_san"]))

    node_id = 0
    for san in san_path:
        match = next((c for c in children_map.get(node_id, []) if c[1] == san), None)
        if not match:
            return None
        node_id = match[0]

    stats, node_by_id = _compute_winrates(cur, owner, color)
    node_stats = stats.get(node_id)
    if node_stats is None:
        return None

    # Main line at the position one ply before this one: the sibling with
    # the most total games played, for comparison against the user's move.
    parent_id = node_by_id[node_id]["parent_id"]
    siblings = children_map.get(parent_id, [])
    sibling_stats = [(san, stats.get(sid, {}).get("total", 0)) for sid, san in siblings]
    main_line_san = max(sibling_stats, key=lambda s: s[1])[0] if sibling_stats else None

    return {
        **node_stats,
        "move_san": san_path[-1] if san_path else None,
        "main_line_move": main_line_san if main_line_san != (san_path[-1] if san_path else None) else None,
        "path": _reconstruct_path(node_by_id, node_id),
    }


@router.get("")
def get_motifs(fen: str, color: str, path: str = "", owner: Owner = Depends(get_owner)):
    """`path` is a space-separated SAN move sequence from the start position
    to `fen` (used for stats lookup and theory retrieval); `fen` is the
    resulting position (used for structural classification and caching)."""
    if color not in ("white", "black"):
        raise HTTPException(status_code=400, detail="color must be 'white' or 'black'")

    _check_rate_limit(owner)

    san_path = path.split() if path else []

    with get_connection() as conn:
        with conn.cursor() as cur:
            motifs = get_cached_motifs(fen, cur)
            your_stats = _stats_for_path(cur, owner, color, san_path)
        conn.commit()

    return {**motifs, "your_stats": your_stats}
