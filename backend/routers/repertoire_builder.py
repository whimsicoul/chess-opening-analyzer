"""Derive a user's opening repertoire tree from their game history.

Plain functions only (no APIRouter) — this module is imported by games.py,
openings.py, and black_openings.py, and routers must not import each other.
"""

from collections import defaultdict

from routers.games import _parse_pgn, _extract_moves

MAX_PLY_DEPTH = 16  # ~8 full moves each side; opening/early-middlegame scope only

_TREE_TABLE = {"white": "white_opening_tree", "black": "black_opening_tree"}


def _count_frequencies(move_lists: list[list[str]]) -> dict[tuple, dict[str, int]]:
    """Map each move-prefix (as a tuple of SAN strings) to {san: count} for its next move."""
    counts: dict[tuple, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for moves in move_lists:
        prefix: tuple = ()
        for san in moves:
            counts[prefix][san] += 1
            prefix = prefix + (san,)
    return counts


def _top_ranked_moves(move_counts: dict[str, int]) -> list[str]:
    """Return the moves in the top 2 ranks by count, including all ties for the 2nd-place count."""
    distinct_counts = sorted(set(move_counts.values()), reverse=True)
    keep_counts = set(distinct_counts[:2])
    return [san for san, count in move_counts.items() if count in keep_counts]


def build_tree_from_games(cur, user_id: int, color: str) -> dict:
    """
    Aggregate user_id's games played as `color` into the corresponding opening
    tree, keeping the top-2-by-rank most-played moves (ties included) at each
    node, capped at MAX_PLY_DEPTH plies. Insertion is additive: existing nodes
    (whether from a prior games-rebuild or from manual entry) are never
    deleted, so manually-added lines and games-derived lines simply union
    together in the same tree.
    """
    table = _TREE_TABLE.get(color)
    if table is None:
        raise ValueError(f"Invalid color: {color}")

    cur.execute(
        "SELECT pgn FROM games WHERE user_id = %s AND player_color = %s",
        (user_id, color),
    )
    rows = cur.fetchall()

    move_lists = []
    for row in rows:
        try:
            game = _parse_pgn(row["pgn"])
        except Exception:
            continue
        moves = _extract_moves(game)[:MAX_PLY_DEPTH]
        if moves:
            move_lists.append(moves)

    counts = _count_frequencies(move_lists)
    nodes_created = 0

    def _insert_or_get(parent_id: int, san: str) -> int:
        nonlocal nodes_created
        cur.execute(
            f"SELECT id FROM {table} WHERE parent_id = %s AND move_san = %s AND user_id = %s",
            (parent_id, san, user_id),
        )
        row = cur.fetchone()
        if row:
            return row["id"]
        cur.execute(
            f"""
            INSERT INTO {table} (parent_id, move_san, opening_name, eco_code, user_id, source)
            VALUES (%s, %s, %s, %s, %s, 'games') RETURNING id
            """,
            (parent_id, san, None, None, user_id),
        )
        nodes_created += 1
        return cur.fetchone()["id"]

    def _walk(prefix: tuple, parent_id: int):
        move_counts = counts.get(prefix)
        if not move_counts:
            return
        for san in _top_ranked_moves(move_counts):
            node_id = _insert_or_get(parent_id, san)
            _walk(prefix + (san,), node_id)

    _walk((), 0)

    cur.execute(
        """
        INSERT INTO repertoire_builds (user_id, color, built_at, games_count)
        VALUES (%s, %s, NOW(), %s)
        ON CONFLICT (user_id, color) DO UPDATE
        SET built_at = EXCLUDED.built_at, games_count = EXCLUDED.games_count
        """,
        (user_id, color, len(move_lists)),
    )

    return {"games_count": len(move_lists), "nodes_created": nodes_created}
