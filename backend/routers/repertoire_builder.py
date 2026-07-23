"""Derive a user's opening repertoire tree from their game history.

Plain functions only (no APIRouter) — this module is imported by games.py,
openings.py, and black_openings.py, and routers must not import each other.
"""

from collections import defaultdict

from routers.games import _parse_pgn, _extract_moves
from owner_utils import Owner

MAX_PLY_DEPTH = 30  # ~15 full moves each side; opening/early-middlegame scope only

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


def _top_ranked_moves(move_counts: dict[str, int], top_n: int = 4) -> list[str]:
    """Return the moves in the top `top_n` ranks by count, including all ties for the last-place count."""
    distinct_counts = sorted(set(move_counts.values()), reverse=True)
    keep_counts = set(distinct_counts[:top_n])
    return [san for san, count in move_counts.items() if count in keep_counts]


def build_tree_from_games(cur, owner: Owner, color: str) -> dict:
    """
    Aggregate owner's games played as `color` into the corresponding opening
    tree, keeping the top-ranked most-played moves (ties included, see
    _top_ranked_moves) at each node, capped at MAX_PLY_DEPTH plies. Insertion is additive: existing nodes
    (whether from a prior games-rebuild or from manual entry) are never
    deleted, so manually-added lines and games-derived lines simply union
    together in the same tree.
    """
    table = _TREE_TABLE.get(color)
    if table is None:
        raise ValueError(f"Invalid color: {color}")

    cur.execute(
        f"SELECT pgn FROM games WHERE {owner.clause()} AND player_color = %s",
        (owner.value, color),
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
            f"SELECT id FROM {table} WHERE parent_id = %s AND move_san = %s AND {owner.clause()}",
            (parent_id, san, owner.value),
        )
        row = cur.fetchone()
        if row:
            return row["id"]
        cur.execute(
            f"""
            INSERT INTO {table} (parent_id, move_san, opening_name, eco_code, user_id, guest_id, source)
            VALUES (%s, %s, %s, %s, %s, %s, 'games') RETURNING id
            """,
            (parent_id, san, None, None, owner.user_id, owner.guest_id),
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

    if owner.user_id is not None:
        cur.execute(
            """
            INSERT INTO repertoire_builds (user_id, color, built_at, games_count)
            VALUES (%s, %s, NOW(), %s)
            ON CONFLICT (user_id, color) WHERE user_id IS NOT NULL DO UPDATE
            SET built_at = EXCLUDED.built_at, games_count = EXCLUDED.games_count
            """,
            (owner.user_id, color, len(move_lists)),
        )
    else:
        cur.execute(
            """
            INSERT INTO repertoire_builds (guest_id, color, built_at, games_count)
            VALUES (%s, %s, NOW(), %s)
            ON CONFLICT (guest_id, color) WHERE guest_id IS NOT NULL DO UPDATE
            SET built_at = EXCLUDED.built_at, games_count = EXCLUDED.games_count
            """,
            (owner.guest_id, color, len(move_lists)),
        )

    return {"games_count": len(move_lists), "nodes_created": nodes_created}
