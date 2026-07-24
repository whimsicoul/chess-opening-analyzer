"""One-off script: populate theory_excerpts from Wikibooks' Chess Opening
Theory book (CC BY-SA 4.0 / GFDL — https://en.wikibooks.org/wiki/Chess_Opening_Theory).

Not run automatically. Run manually from backend/:
    python -m scripts.ingest_theory

Walks Wikibooks pages whose URL path is itself a SAN move sequence
(e.g. .../1._e4/1...e5/2._Nf3), starting from the SAN prefixes actually
present in your own repertoire trees (white_opening_tree / black_opening_tree),
capped at MAX_PLY_DEPTH plies — same depth this app ever builds trees to.
Re-run anytime to expand coverage; upserts are idempotent.
"""

import re
import sys
import time
import urllib.parse

import requests

sys.path.insert(0, ".")  # allow running as `python scripts/ingest_theory.py` from backend/
from db import get_connection
from routers.repertoire_builder import MAX_PLY_DEPTH

API_URL = "https://en.wikibooks.org/w/api.php"
BASE_PAGE = "Chess_Opening_Theory"
USER_AGENT = "chess-analyzer-web/1.0 (personal opening-repertoire tool; theory ingestion script)"
REQUEST_DELAY_SECONDS = 1.0  # sequential, polite pacing per Wikimedia API etiquette

_session = requests.Session()
_session.headers.update({"User-Agent": USER_AGENT})


def _api_get(params: dict) -> dict:
    params = {**params, "format": "json"}
    resp = _session.get(API_URL, params=params, timeout=15)
    resp.raise_for_status()
    time.sleep(REQUEST_DELAY_SECONDS)
    return resp.json()


def _wikibooks_title_for_path(san_path: list[str]) -> str:
    """Wikibooks encodes each ply as '<n>.<white move>' or '<n>...<black move>',
    joined by '/'. E.g. ['e4','e5','Nf3'] -> 'Chess_Opening_Theory/1._e4/1...e5/2._Nf3'."""
    segments = []
    for i, san in enumerate(san_path):
        move_number = i // 2 + 1
        if i % 2 == 0:
            segments.append(f"{move_number}._{san}")
        else:
            segments.append(f"{move_number}...{san}")
    return BASE_PAGE + "/" + "/".join(segments)


def _fetch_wikitext(title: str) -> str | None:
    data = _api_get({
        "action": "query",
        "prop": "revisions",
        "titles": title,
        "rvprop": "content",
        "rvslots": "main",
    })
    pages = data.get("query", {}).get("pages", {})
    for page in pages.values():
        if "missing" in page:
            return None
        revisions = page.get("revisions", [])
        if revisions:
            return revisions[0]["slots"]["main"]["*"]
    return None


_TEMPLATE_RE = re.compile(r"\{\{.*?\}\}", re.DOTALL)
_REF_RE = re.compile(r"<ref.*?</ref>|<ref[^/]*/>", re.DOTALL)
_LINK_RE = re.compile(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]")
_EXTLINK_RE = re.compile(r"\[https?://\S+ ([^\]]+)\]")
_MARKUP_RE = re.compile(r"'''?|<[^>]+>")
_TABLE_RE = re.compile(r"\{\|.*?\|\}", re.DOTALL)


def _extract_prose(wikitext: str) -> str:
    """Strip wikitext markup down to plain strategic-explanation paragraphs.
    Deliberately conservative: drops tables/templates/refs entirely rather
    than trying to parse them, since only prose is used for LLM grounding."""
    text = _TABLE_RE.sub("", wikitext)
    text = _TEMPLATE_RE.sub("", text)
    text = _REF_RE.sub("", text)
    text = _LINK_RE.sub(r"\1", text)
    text = _EXTLINK_RE.sub(r"\1", text)
    text = _MARKUP_RE.sub("", text)

    paragraphs = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith(("==", "*", "#", "|", "!")):
            continue
        paragraphs.append(line)
    return "\n\n".join(paragraphs).strip()


def _fetch_child_links(title: str) -> list[str]:
    """Direct child variation pages linked from this page (used to discover
    sub-variations without needing to already know every SAN branch)."""
    data = _api_get({
        "action": "parse",
        "page": title,
        "prop": "links",
    })
    links = data.get("parse", {}).get("links", [])
    prefix = title + "/"
    return [
        l["*"] for l in links
        if l.get("ns") == 0 and l["*"].startswith(prefix)
        and l["*"].count("/") == title.count("/") + 1  # direct child only, not grandchild
    ]


def _repertoire_san_prefixes(cur) -> set[tuple[str, ...]]:
    """Every SAN move-prefix (as a tuple, root exclusive) present in the
    user's white/black opening trees, capped at MAX_PLY_DEPTH."""
    prefixes: set[tuple[str, ...]] = set()
    for table in ("white_opening_tree", "black_opening_tree"):
        cur.execute(f"SELECT id, parent_id, move_san FROM {table}")
        rows = cur.fetchall()
        by_id = {r["id"]: r for r in rows}
        for row in rows:
            path = []
            current = row
            while current is not None:
                path.append(current["move_san"])
                current = by_id.get(current["parent_id"])
            path.reverse()
            path = path[:MAX_PLY_DEPTH]
            for length in range(1, len(path) + 1):
                prefixes.add(tuple(path[:length]))
    return prefixes


def ingest(san_prefixes: set[tuple[str, ...]]):
    with get_connection() as conn:
        with conn.cursor() as cur:
            seen_titles: set[str] = set()
            for san_path in sorted(san_prefixes, key=len):
                title = _wikibooks_title_for_path(list(san_path))
                if title in seen_titles:
                    continue
                seen_titles.add(title)

                wikitext = _fetch_wikitext(title)
                if wikitext is None:
                    print(f"  [skip] no page for {title}")
                    continue

                excerpt = _extract_prose(wikitext)
                if not excerpt:
                    print(f"  [skip] no prose extracted for {title}")
                    continue

                san_key = " ".join(san_path)
                source_url = "https://en.wikibooks.org/wiki/" + urllib.parse.quote(title)
                cur.execute(
                    """
                    INSERT INTO theory_excerpts (san_path, opening_name, excerpt, source_url, source_title)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (san_path) DO UPDATE
                    SET opening_name = EXCLUDED.opening_name, excerpt = EXCLUDED.excerpt,
                        source_url = EXCLUDED.source_url, source_title = EXCLUDED.source_title,
                        fetched_at = NOW()
                    """,
                    (san_key, title.rsplit("/", 1)[-1], excerpt, source_url, title.replace("_", " ")),
                )
                conn.commit()
                print(f"  [ok] {san_key} <- {title} ({len(excerpt)} chars)")
        print("Done.")


def main():
    with get_connection() as conn:
        with conn.cursor() as cur:
            prefixes = _repertoire_san_prefixes(cur)
    print(f"Found {len(prefixes)} SAN prefixes across your repertoire trees.")
    if not prefixes:
        print("No repertoire lines found — build/import a repertoire first, then re-run this script.")
        return
    ingest(prefixes)


if __name__ == "__main__":
    main()
