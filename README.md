# Chess Opening Analyzer

A personal chess improvement tool for tracking opening repertoire adherence and analyzing game history.

**Live site:** https://chess-opening-analyzer.up.railway.app

## Features

- **Games** — Import from Lichess/Chess.com or drag-and-drop PGN uploads right on the Games page; view results by opening/ECO with move-by-move board playback
- **Auto-built repertoire** — Uploading or importing games automatically builds/updates your White and Black opening trees from your own move history (most-played continuations per line); manually-added lines are merged, never overwritten. The Repertoire page shows when it was last auto-built and lets you force a rebuild
- **Analytics** — The step after uploading: win/loss/draw rates, a server-computed "Weakest Lines" breakdown (win rate, average opponent rating, sample size per repertoire line), and a zoomable sunburst chart of your saved repertoire tree, all pointing you to exactly where your opening prep is failing
- **Repertoire** — Click a weak line in Analytics (or a sunburst segment) and it jumps straight here, highlighted. One page, toggle between White ♔ and Black ♚. Build opening lines via interactive board or paste PGN; live Lichess Cloud Eval shows top 3 engine moves (falls back to local Stockfish WASM if unavailable)
- **Repertoire → Ideas panel** — A second tab next to the engine/opening-book view. For whatever position is on the board, shows three separate, non-blended sections: your own stats for that position (e.g. "you play 8...Bd7 at 29%, main line is 8...Re8"), computed structural facts (pawn structure, open files, outpost squares — no prose, just labels), and 2-3 plan bullets per side, synthesized by an LLM but constrained to the computed facts plus a retrieved theory excerpt, with a source citation. See [Roadmap](#roadmap) for setup and what's still to come
- **Browse without an account** — Games, Analytics, and Repertoire all work for anonymous visitors via a guest cookie; creating an account is only required to persist data long-term and to reach Settings
- **Settings** — Connect Lichess/Chess.com usernames (used to auto-detect your side on import), change username/email/password, delete account

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19 + Vite, chess.js, react-chessboard, d3 |
| Backend | FastAPI + uvicorn, python-chess |
| Database | PostgreSQL — Neon (production) or local |
| Auth | JWT (python-jose + bcrypt), optional — guests get a cookie-based identity instead |
| Hosting | Railway (backend + frontend, separate services) |

## Local Setup

**Prerequisites:** Node.js 18+, Python 3.10+, PostgreSQL

### Backend

```bash
cd backend
python -m venv venv && venv\Scripts\activate   # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env`:

```env
# Option A — individual fields (local Postgres)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_db_name
DB_USER=postgres
DB_PASSWORD=your_password

# Option B — connection string (Neon or other hosted Postgres)
# DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require

JWT_SECRET=<run: python -c "import secrets; print(secrets.token_hex(32))">
JWT_EXPIRE_DAYS=7

FRONTEND_URL=http://localhost:5173

# Optional — set to "development" to relax guest cookie flags (SameSite=Lax
# instead of None) for plain-HTTP local dev
APP_ENV=development

# Optional — email verification (Gmail: use App Password, not account password)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASSWORD=your_app_password
SMTP_FROM=your@gmail.com

# Optional — Lichess token (for import and opening explorer lookups)
LICHESS_TOKEN=

# Optional — powers the Repertoire "Ideas" panel's Plans section (LLM
# synthesis of typical plans, grounded in computed structure + retrieved
# theory text). Without it, the Ideas panel still shows your stats and
# structural facts, just no Plans section. See Roadmap below.
ANTHROPIC_API_KEY=
```

> Create the database first (`createdb your_db_name`). Schema tables are created automatically on startup.

### Frontend

```bash
cd frontend && npm install
```

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:8001
```

## Running

**Windows (recommended):**
```powershell
powershell -ExecutionPolicy Bypass -File start.ps1
```
Clears ports 8001 and 5173, then starts both servers.

**Manual:**
```bash
# Terminal 1 — Backend
cd backend && uvicorn main:app --reload --port 8001

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## Project Structure

```
chess-analyzer-web/
├── start.ps1
├── backend/
│   ├── main.py                     # App entrypoint, CORS, DB migration
│   ├── db.py                       # PostgreSQL helpers (supports DATABASE_URL or individual vars)
│   ├── auth_utils.py               # JWT + password hashing
│   ├── owner_utils.py              # Resolves request "owner" — logged-in user or guest cookie
│   ├── email_utils.py              # Email verification sending
│   ├── migrate.py                  # Manual schema migration runner (main.py also runs migrations on startup)
│   ├── test_db.py                  # Manual DB connectivity check, not an automated test
│   ├── motifs.py                   # Ideas panel: deterministic structural classifier (pawn structure, files, outposts) over a FEN
│   ├── motif_cache.py              # Ideas panel: LLM plan synthesis + Postgres cache (motif_cache table, keyed by FEN) + background precompute
│   ├── theory_corpus.py            # Ideas panel: read-side lookup into theory_excerpts by SAN path
│   ├── scripts/
│   │   └── ingest_theory.py        # Manually-run scraper: populates theory_excerpts from Wikibooks Chess Opening Theory (CC BY-SA 4.0)
│   └── routers/
│       ├── auth.py                 # Register, login, email verify, account settings, platform usernames
│       ├── openings.py             # White repertoire CRUD, tree builder, status/rebuild, weaknesses, cloud-eval + explorer proxy
│       ├── black_openings.py       # Black repertoire CRUD, tree builder, status/rebuild
│       ├── games.py                # PGN upload/import, deviation detection, triggers repertoire auto-build
│       ├── motifs.py               # GET /motifs — Ideas panel: your stats + structural facts + plans for a position
│       └── repertoire_builder.py   # Shared helper (not a router): builds/merges opening trees from a user's stored games
└── frontend/src/
    ├── App.jsx                     # Routes (/upload, /white-repertoire, /black-repertoire, /stats, /visualization kept as redirects for old links)
    ├── api.js                      # Axios + JWT interceptors
    ├── context/
    │   └── AuthContext.jsx
    ├── hooks/
    │   └── useEngine.js            # Lichess Cloud Eval hook, falls back to local Stockfish WASM
    ├── utils/
    │   └── woodenPieces.jsx        # Custom wooden chess piece set for the board components
    ├── components/
    │   ├── ChessBoardViewer.jsx
    │   ├── EyeIcon.jsx
    │   ├── Navbar.jsx
    │   ├── OpeningSunburst.jsx
    │   ├── MotifPanel.jsx          # Repertoire "Ideas" tab: stats / structural facts / plans for the current board position
    │   └── ProtectedRoute.jsx      # Gates only account-only routes (currently just /settings)
    └── pages/
        ├── Home.jsx
        ├── Login.jsx / Register.jsx / VerifyEmail.jsx
        ├── Games.jsx                # Game table + playback + inline PGN upload/drag-drop; usable as a guest
        ├── Analytics.jsx            # Win/loss/draw rates, weakest-lines breakdown, sunburst chart; clicking a weak line jumps into Repertoire; usable as a guest
        ├── Repertoire.jsx           # White/Black toggle, auto-build status banner + rebuild control; can deep-load a line via nav state from Analytics; usable as a guest
        └── Settings.jsx             # Account info, connected accounts, security, delete account — requires an account
```

## Roadmap

### Repertoire → Ideas panel (in progress)

The goal: turn Repertoire from "here's your tree" into "here's what each position actually means and how to learn it." Three phases:

1. **Structural facts + your stats** — ✅ built. Deterministic, no external calls: pawn structure classification, open/semi-open files, outposts (`backend/motifs.py`), plus your own win-rate/main-line comparison reusing the existing weaknesses computation. Works out of the box, no setup required.
2. **Plans, grounded and cited** — ✅ built, needs setup to activate:
   - Set `ANTHROPIC_API_KEY` in `backend/.env` (see above) — without it, the Plans section stays empty but Stats/Structure still work.
   - Populate the theory corpus by running the ingestion script once your repertoire has some lines saved:
     ```bash
     cd backend
     venv\Scripts\activate
     python -m scripts.ingest_theory
     ```
     This pulls prose excerpts from [Wikibooks' Chess Opening Theory](https://en.wikibooks.org/wiki/Chess_Opening_Theory) (CC BY-SA 4.0) for the SAN move-prefixes actually in your White/Black trees, and stores them in `theory_excerpts`. Safe to re-run any time your repertoire grows — it's idempotent and only adds/updates rows for lines it finds.
   - After that, plans generate automatically: precomputed in the background right after "Rebuild from Games," or generated-and-cached on first view for anything else (manually-added lines, Analytics deep-links). Every distinct position is synthesized once, ever — cached in Postgres (`motif_cache`) and shared across the whole app, not per-user.
3. **Quiz mode** — not started. Deliberately deferred until the content layer above is live and validated; testing recall only makes sense once there's real material to be quizzed on. Leading candidates, not yet decided between:
   - **Move recall** — "what does your repertoire play here?" against your own saved lines. No new content pipeline needed — could ship independently of the rest of this list.
   - **Structural-fact recognition** — "what pawn structure is this?" / "which square is the outpost?", generated straight from the classifier's output.
   - **Plan recall** — multiple-choice against the synthesized plan bullets.
   - **"Beat your own stats" drill** — spaced-repetition queue prioritized by your weakest lines (reuses the existing `/openings/weaknesses` endpoint), wrapping any of the question types above.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `ModuleNotFoundError` | Activate venv: `venv\Scripts\activate` |
| PostgreSQL connection error | Check `.env` credentials and that the DB exists |
| Frontend can't reach backend | Verify `VITE_API_URL` port matches uvicorn; restart frontend after `.env` changes |
| Port in use / requests hang | Use `start.ps1` — `uvicorn --reload` spawns two processes; restarting without clearing ports causes conflicts |
| Email not arriving | Use a Gmail App Password, not your account password |
| Guest data seems to disappear | Guest identity is a cookie (`guest_id`); clearing cookies or switching browsers loses guest-only data. Register an account to keep it permanently |
