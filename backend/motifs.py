"""Deterministic structural classifier for a chess position.

Pure functions over a FEN using python-chess only — no I/O, no network calls.
Mirrors the plain-function style of routers/repertoire_builder.py. Output is
treated as ground truth (never generated) and feeds both the frontend
"structural facts" panel and, as grounding context, the LLM plans synthesis
in motif_cache.py.
"""

import chess

FILES = "abcdefgh"


def normalize_fen(fen: str) -> str:
    """Clock-free position key so transposed move orders and later
    reoccurrences of the same position share one cache entry. Keeps board,
    side to move, castling rights, and en-passant square; drops halfmove/
    fullmove counters."""
    board = chess.Board(fen)
    return board.epd()


def _pawns_by_file(board: chess.Board, color: bool) -> dict[str, list[int]]:
    """Map file letter -> sorted list of ranks (1-8) holding a pawn of `color`."""
    files: dict[str, list[int]] = {f: [] for f in FILES}
    for sq in board.pieces(chess.PAWN, color):
        files[FILES[chess.square_file(sq)]].append(chess.square_rank(sq) + 1)
    for f in files:
        files[f].sort()
    return files


def _open_and_semi_open_files(white_pawns: dict, black_pawns: dict) -> dict:
    open_files = []
    semi_open = {"white": [], "black": []}
    for f in FILES:
        has_white = bool(white_pawns[f])
        has_black = bool(black_pawns[f])
        if not has_white and not has_black:
            open_files.append(f)
        elif not has_white and has_black:
            semi_open["white"].append(f)  # white has no pawn -> open for white's rooks
        elif has_white and not has_black:
            semi_open["black"].append(f)
    return {"open_files": open_files, "semi_open_files": semi_open}


def _is_locked_file(white_pawns: dict, black_pawns: dict, file_letter: str) -> bool:
    """True if that file has a white pawn immediately blockaded by a black
    pawn one rank ahead (face-to-face, neither can advance without a
    capture) — the actual definition of a "locked" pawn pair, not just
    both sides having some pawn on the file."""
    for wr in white_pawns[file_letter]:
        if (wr + 1) in black_pawns[file_letter]:
            return True
    return False


def _classify_pawn_structure(white_pawns: dict, black_pawns: dict) -> str | None:
    """Rule-based pattern match against the pawn skeleton for the ~9 most
    common named structures relevant to typical repertoires. Returns None
    (unclassified) rather than guessing when no rule matches — an
    unclassified structure is preferable to a wrong label."""
    wc, bc = white_pawns["c"], black_pawns["c"]
    wd, bd = white_pawns["d"], black_pawns["d"]
    we, be = white_pawns["e"], black_pawns["e"]

    all_files_pawn_count = {f: len(white_pawns[f]) + len(black_pawns[f]) for f in FILES}

    # Isolated Queen's Pawn: white or black has a lone d-pawn with empty c- and e-files for that side
    if wd and not wc and not we:
        return "isolated_queens_pawn_white"
    if bd and not bc and not be:
        return "isolated_queens_pawn_black"

    # Carlsbad: white/black pawns on c3/d4/e3-ish vs c6/d5/e6-ish with open e-file tension resolved,
    # classic marker is a half-open c-file for white and half-open e-file for black (or vice versa)
    # after the c-pawn (white) or e-pawn (black) capture in the QGD Exchange.
    if not wc and bc and not be and we:
        return "carlsbad"
    if not bc and wc and not we and be:
        return "carlsbad"

    # Stonewall: pawns locked on d4/e3/f4 (white) or d5/e6/f5 (black) with c-pawn support
    if 4 in wd and 3 in we and 4 in white_pawns["f"]:
        return "stonewall_white"
    if 5 in bd and 6 in be and 5 in black_pawns["f"]:
        return "stonewall_black"

    # Hedgehog: pawns on a6/b6/d6/e6 (black) or a3/b3/d3/e3 (white) with no c-pawn advance,
    # opponent has space on c4/c5
    if (6 in black_pawns["a"] and 6 in black_pawns["b"] and 6 in bd and 6 in be
            and (4 in white_pawns["c"])):
        return "hedgehog_black"
    if (3 in white_pawns["a"] and 3 in white_pawns["b"] and 3 in wd and 3 in we
            and (5 in black_pawns["c"])):
        return "hedgehog_white"

    # Hanging pawns: connected c+d (or similar adjacent pair) pawns, isolated from other pawns,
    # each side on its 4th/5th rank with open files on both sides
    if wc and wd and not white_pawns["b"] and not we and len(wc) == 1 and len(wd) == 1:
        return "hanging_pawns_white"
    if bc and bd and not black_pawns["b"] and not be and len(bc) == 1 and len(bd) == 1:
        return "hanging_pawns_black"

    # Closed center: both central files (d and e) are locked pawn-vs-pawn.
    # A single central pawn touch on its own (e.g. Ruy Lopez e4/e5, with d4
    # still on its home square) isn't distinctive enough for a named-structure
    # label — requiring both d and e locked filters that case out while still
    # catching genuinely closed positions (King's Indian, French Advance-style).
    if _is_locked_file(white_pawns, black_pawns, "d") and _is_locked_file(white_pawns, black_pawns, "e"):
        return "closed_center"

    return None


def _outposts(board: chess.Board) -> list[dict]:
    """A square is an outpost for `color` if it's defended by one of that
    color's pawns and can never be challenged by an enemy pawn (no enemy
    pawn exists, or could ever exist via advance, on either adjacent file
    ahead of the square from the enemy's perspective)."""
    outposts = []
    for color in (chess.WHITE, chess.BLACK):
        enemy = not color
        enemy_pawns = list(board.pieces(chess.PAWN, enemy))
        for rank in range(2, 7):  # ranks 3-7 (0-indexed 2-6), exclude back ranks
            for file_idx in range(8):
                sq = chess.square(file_idx, rank)
                # must be in enemy territory: ranks 4-6 for white outposts, 3-5 for black (0-indexed)
                if color == chess.WHITE and rank not in (3, 4, 5):
                    continue
                if color == chess.BLACK and rank not in (2, 3, 4):
                    continue

                defended_by_pawn = any(
                    chess.square_file(p) in (file_idx - 1, file_idx + 1)
                    and chess.square_rank(p) == rank - (1 if color == chess.WHITE else -1)
                    for p in board.pieces(chess.PAWN, color)
                )
                if not defended_by_pawn:
                    continue

                challengeable = False
                for ep in enemy_pawns:
                    ep_file = chess.square_file(ep)
                    if ep_file not in (file_idx - 1, file_idx + 1):
                        continue
                    ep_rank = chess.square_rank(ep)
                    # enemy pawn on an adjacent file can still advance to challenge
                    # this square if it hasn't already passed it
                    if color == chess.WHITE and ep_rank > rank:
                        challengeable = True
                    elif color == chess.BLACK and ep_rank < rank:
                        challengeable = True
                if not challengeable:
                    outposts.append({
                        "square": chess.square_name(sq),
                        "side": "white" if color == chess.WHITE else "black",
                    })
    return outposts


def _space(white_pawns: dict, black_pawns: dict) -> dict:
    """Simple space heuristic: sum of (rank advancement past the 2nd/7th
    home rank) across all pawns for each side."""
    white_space = sum(r - 2 for f in FILES for r in white_pawns[f] if r > 2)
    black_space = sum(7 - r for f in FILES for r in black_pawns[f] if r < 7)
    return {"white": white_space, "black": black_space}


def classify_structure(fen: str) -> dict:
    board = chess.Board(fen)
    white_pawns = _pawns_by_file(board, chess.WHITE)
    black_pawns = _pawns_by_file(board, chess.BLACK)

    files_info = _open_and_semi_open_files(white_pawns, black_pawns)
    structure_name = _classify_pawn_structure(white_pawns, black_pawns)

    return {
        "pawn_structure": structure_name,
        "open_files": files_info["open_files"],
        "semi_open_files": files_info["semi_open_files"],
        "outposts": _outposts(board),
        "space": _space(white_pawns, black_pawns),
    }
