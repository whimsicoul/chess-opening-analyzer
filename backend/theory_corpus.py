"""Read-side lookup over theory_excerpts (populated offline by
scripts/ingest_theory.py). Retrieval only — no network calls here.
"""


def lookup_theory(san_path: list[str], cur) -> dict | None:
    """Find the theory excerpt for the longest prefix of `san_path` present
    in theory_excerpts, walking from the full path down to the empty prefix.
    Returns None if nothing in the corpus covers this line at all."""
    for length in range(len(san_path), 0, -1):
        prefix_key = " ".join(san_path[:length])
        cur.execute(
            "SELECT opening_name, excerpt, source_url, source_title FROM theory_excerpts WHERE san_path = %s",
            (prefix_key,),
        )
        row = cur.fetchone()
        if row and row["excerpt"]:
            return {
                "opening_name": row["opening_name"],
                "excerpt": row["excerpt"],
                "source_url": row["source_url"],
                "source_title": row["source_title"],
            }
    return None
