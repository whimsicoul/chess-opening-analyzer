"""Cache layer for the Repertoire Ideas panel: structural facts (from
motifs.py, deterministic) + plans prose (retrieved theory + LLM synthesis),
keyed by normalized FEN so the cache is shared across every owner's tree —
a position's structure and plans don't depend on who reached it.
"""

import os
import json
import chess

from motifs import classify_structure, normalize_fen
from theory_corpus import lookup_theory

_ANTHROPIC_MODEL = "claude-sonnet-5"


def san_path_to_fen(san_path: list[str]) -> str:
    """Replay a SAN move sequence from the starting position to its
    resulting FEN. Shared by the precompute walk and the on-demand endpoint
    so tree-node-to-FEN derivation only happens in one place."""
    board = chess.Board()
    for san in san_path:
        board.push_san(san)
    return board.fen()


def _synthesize_plans(structure: dict, theory: dict | None) -> tuple[list, list]:
    """Call the LLM to phrase 2-3 plan bullets per side, constrained to the
    computed structural facts and (if found) the retrieved theory excerpt —
    the model is a writer over given facts, not a source of new ones.
    Returns (plans, citations); plans is [] if no API key is configured or
    the call fails, so the rest of the panel still renders."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return [], []

    grounding = {
        "pawn_structure": structure.get("pawn_structure"),
        "open_files": structure.get("open_files"),
        "semi_open_files": structure.get("semi_open_files"),
        "outposts": structure.get("outposts"),
    }
    excerpt_text = theory["excerpt"] if theory else None

    prompt = (
        "You are annotating a chess position for a student. You are given "
        "computed structural facts about the position and, optionally, a "
        "retrieved theory excerpt. Using ONLY those facts — do not introduce "
        "any claim not supported by them — write 2-3 short bullet points per "
        "side describing that side's typical plan. If the structural facts "
        "don't clearly support a plan, say less rather than invent one.\n\n"
        f"Structural facts (JSON): {json.dumps(grounding)}\n\n"
        f"Retrieved theory excerpt: {excerpt_text or '(none available)'}\n\n"
        "Respond as JSON only, matching this shape exactly:\n"
        '{"white": ["bullet 1", "bullet 2"], "black": ["bullet 1", "bullet 2"]}'
    )

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        resp = client.messages.create(
            model=_ANTHROPIC_MODEL,
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}],
        )
        text = resp.content[0].text.strip()
        if text.startswith("```"):
            text = text.strip("`")
            text = text.split("\n", 1)[1] if "\n" in text else text
        parsed = json.loads(text)
        plans = [
            {"side": side, "bullets": parsed[side]}
            for side in ("white", "black")
            if parsed.get(side)
        ]
    except Exception:
        return [], []

    citations = []
    if theory:
        citations.append({"title": theory["source_title"], "url": theory["source_url"]})
    return plans, citations


def precompute_for_owner_tree(owner, color: str):
    """Background-task entry point: walk every node in the owner's
    white/black opening tree and generate+cache motifs for each, so the
    Ideas panel is instant when the user opens it. Runs after the triggering
    request has already returned (see routers/openings.py & black_openings.py
    /rebuild endpoints), so it opens its own DB connection rather than
    reusing the request's cursor."""
    from db import get_connection

    tree_table = "white_opening_tree" if color == "white" else "black_opening_tree"

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT id, parent_id, move_san FROM {tree_table} WHERE {owner.clause()}",
                (owner.value,),
            )
            rows = cur.fetchall()
            by_id = {r["id"]: r for r in rows}

            for row in rows:
                path = []
                current = row
                while current is not None:
                    path.append(current["move_san"])
                    current = by_id.get(current["parent_id"])
                path.reverse()

                try:
                    fen = san_path_to_fen(path)
                    get_or_generate_motifs(fen, path, cur)
                    conn.commit()
                except Exception:
                    # A single bad/illegal-move node shouldn't abort the
                    # whole precompute pass — every other node still benefits.
                    conn.rollback()


def get_or_generate_motifs(fen: str, san_path: list[str], cur) -> dict:
    """Look up cached structure/plans for a position, generating and
    persisting them on a cache miss. `cur` is an open DB cursor (caller
    manages the transaction/commit, matching every other router in this
    codebase)."""
    key = normalize_fen(fen)

    cur.execute("SELECT structure, plans, source_citations FROM motif_cache WHERE fen = %s", (key,))
    row = cur.fetchone()
    if row:
        return {
            "structure": row["structure"],
            "plans": row["plans"],
            "source_citations": row["source_citations"],
        }

    structure = classify_structure(fen)
    theory = lookup_theory(san_path, cur)
    plans, citations = _synthesize_plans(structure, theory)

    cur.execute(
        """
        INSERT INTO motif_cache (fen, structure, plans, source_citations)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (fen) DO UPDATE
        SET structure = EXCLUDED.structure, plans = EXCLUDED.plans,
            source_citations = EXCLUDED.source_citations, generated_at = NOW()
        """,
        (key, json.dumps(structure), json.dumps(plans), json.dumps(citations)),
    )

    return {"structure": structure, "plans": plans, "source_citations": citations}
