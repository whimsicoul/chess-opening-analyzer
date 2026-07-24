# Project: Chess Opening Analyzer Web

## Purpose
A personal chess improvement tool that connects to users' game history, tracks adherence to their opening repertoire, and surfaces patterns in results. Claude should help with code development, debugging, performance optimization, and feature suggestions while maintaining project goals.

## Tech Stack
- **Frontend:** React 19 + Vite, chess.js, react-chessboard, d3, axios
- **Backend:** FastAPI + uvicorn, python-chess, PostgreSQL (psycopg2-binary), python-jose + bcrypt

## Features
### Games
- Import games from Lichess/Chess.com or via PGN uploads (inline drag-and-drop on the Games page)
- Display in table: result, opening name, ECO code, both players' names
- Full move-by-move board playback on game click
- Uploading/importing games automatically builds/updates the user's opening repertoire tree (see Repertoire)
- Usable without an account (see Guest access below)

### Analytics
- Single page (`Analytics.jsx`) combining stats and visualization — not separate pages/routes
- The step after uploading games: win/draw/loss rates, plus a server-computed "Weakest Lines" table (win rate, avg. opponent rating, sample size per repertoire line) that tells the user exactly where their opening prep is failing
- Interactive sunburst chart of saved repertoire, segments zoomable, hover shows opening names and ECO codes
- Clicking a weak line (or a sunburst segment) navigates to `/repertoire` with that line pre-loaded and highlighted, so the user can go straight from "here's a weakness" to "fix the repertoire" — see `navigate('/repertoire', { state: { moves, color } })` in `Analytics.jsx` and the matching nav-state effect in `Repertoire.jsx`
- Usable without an account (see Guest access below)

### Repertoire
- Single page (`Repertoire.jsx`) with a White ♔ / Black ♚ toggle — not separate pages/routes
- The fix-it step reached from Analytics: expand or patch the lines Analytics flagged as weak, or build out the tree from scratch
- Auto-built from uploaded game history (most-played continuations), and merged with manually-added lines — manual lines are never overwritten
- Add lines manually via interactive board or paste PGN
- Lichess Cloud Eval panel shows top 3 engine moves with evaluation scores (falls back to local Stockfish WASM if unavailable)
- Save lines with name and ECO code
- Shows an auto-build status banner (last built, games count) with a manual "Rebuild from Games" action
- Usable without an account (see Guest access below)
- **Ideas panel** ("Ideas" tab, right column, alongside "Analyze"): for the position currently on the board, shows three visually distinct sections — your stats (computed, e.g. "you play 8...Bd7 (29%), main line is 8...Re8"), structural facts (computed pawn-structure/open-file/outpost classification, no prose), and plans (2-3 bullets per side, LLM-synthesized but grounded in the structural facts plus a retrieved Wikibooks excerpt, with a source citation) — never blended into one narrative, since the three sources carry different reliability. See `backend/motifs.py` (structural classifier), `backend/theory_corpus.py` + `backend/scripts/ingest_theory.py` (Wikibooks CC BY-SA retrieval corpus, run manually), `backend/motif_cache.py` (LLM synthesis + Postgres cache keyed by FEN, shared across all owners), `backend/routers/motifs.py` (`GET /motifs`), and `frontend/src/components/MotifPanel.jsx`. Precomputed in the background after "Rebuild from Games"; generated on-demand and cached for any other position (e.g. manually-added lines, Analytics deep-links). Requires `ANTHROPIC_API_KEY` in backend `.env` — the plans section silently omits itself (stats/structure still show) if unset.

### Guest access
- Games, Repertoire, and Analytics all work for anonymous visitors — `backend/owner_utils.py` resolves each request to either a logged-in `user_id` or an anonymous `guest_id` cookie, so most routes don't require auth
- Only Settings requires a real account (`ProtectedRoute.jsx` gates just that route)
- Registering an account is how a user makes their data durable beyond the guest cookie's lifetime/browser

### Settings
- Connect Lichess/Chess.com usernames (auto-detects which side the user played on import)
- Change username, email, password; delete account
- Requires a logged-in account

## Project Structure Reference
chess-analyzer-web/
├── start.ps1
│ # One-click start script (Windows), starts backend and frontend servers
├── backend/
│ # Backend code using FastAPI, handles API endpoints, database, and auth
│
│ main.py
│ # FastAPI app entrypoint, CORS, DB startup migration
│
│ db.py
│ # PostgreSQL connection helper functions
│
│ auth_utils.py
│ # JWT creation, validation, password hashing
│
│ owner_utils.py
│ # Resolves request "owner" — logged-in user_id or guest_id cookie — powers guest access
│
│ email_utils.py
│ # Email verification sending
│
│ migrate.py
│ # Manual schema migration runner (main.py also runs migrations automatically on startup)
│
│ test_db.py
│ # Manual DB connectivity check — not an automated test, not run by CI
│
│ routers/
│ auth.py
│ # Register, login, email verification, account settings, platform usernames
│ openings.py
│ # White repertoire CRUD, tree builder, status/rebuild, weaknesses, cloud-eval + explorer proxy
│ black_openings.py
│ # Black repertoire CRUD, tree builder, status/rebuild
│ games.py
│ # Game upload/import, deviation detection, triggers repertoire auto-build
│ repertoire_builder.py
│ # Shared helper (no APIRouter): builds/merges opening trees from a user's stored games
│ motifs.py
│ # GET /motifs — Ideas panel: your stats + structural facts + plans for a position
│
│ motifs.py (backend/motifs.py, distinct from routers/motifs.py above)
│ # Deterministic structural classifier (pawn structure, open files, outposts) — pure functions over a FEN
│ motif_cache.py
│ # LLM plans synthesis + Postgres cache (motif_cache table, keyed by normalized FEN) + background precompute
│ theory_corpus.py
│ # Read-side lookup into theory_excerpts (retrieval by SAN path prefix)
│ scripts/
│ ingest_theory.py
│ # Manually-run scraper: populates theory_excerpts from Wikibooks Chess Opening Theory (CC BY-SA 4.0)
│
├── frontend/
│ # React frontend code, displays games, repertoire, analytics
│
│ src/
│ App.jsx
│ # Routes and main layout (/upload, /white-repertoire, /black-repertoire, /stats, /visualization kept as redirects for old links)
│ api.js
│ # Axios instance with JWT interceptors
│ context/
│ AuthContext.jsx
│ # Auth provider, context for frontend components
│ hooks/
│ useEngine.js
│ # Lichess Cloud Eval hook, falls back to local Stockfish WASM
│ utils/
│ woodenPieces.jsx
│ # Custom wooden chess piece set shared by board components
│ components/
│ ProtectedRoute.jsx
│ # Route guard — gates only account-only routes (currently just /settings)
│ ChessBoardViewer.jsx
│ # Move-by-move chess board component
│ EyeIcon.jsx
│ # Shared show/hide password icon
│ Navbar.jsx
│ # Navigation bar
│ OpeningSunburst.jsx
│ # Sunburst chart component
│ MotifPanel.jsx
│ # Repertoire "Ideas" tab: stats / structural facts / plans for the current board position
│ pages/
│ Home.jsx
│ # Homepage
│ Login.jsx / Register.jsx / VerifyEmail.jsx
│ # Auth pages
│ Games.jsx
│ # Game table view, playback, and inline PGN upload/drag-drop; usable as a guest
│ Analytics.jsx
│ # Win/loss/draw stats, weakest-lines breakdown, sunburst chart; clicking a weak line jumps into Repertoire; usable as a guest
│ Repertoire.jsx
│ # White/Black toggle; auto-build status banner + rebuild control; can deep-load a line via nav state from Analytics; usable as a guest
│ Settings.jsx
│ # Account info, connected accounts, security, delete account — requires an account


## Setup & Environment
- Node.js v18+, Python 3.10+, PostgreSQL running locally
- Backend: `venv`, `.env` for DB, JWT, and SMTP credentials
- Frontend: `.env` for API URL
- Use `start.ps1` or manual terminal commands to launch servers

## Instructions for Claude
- Prioritize **clean, modular, maintainable code**
- Optimize **PGN parsing** and large data handling
- Provide **efficient database schemas** for scalable storage of games, moves, and repertoire
- For UI: keep **minimal, chess-focused, and responsive**
- Suggest **code improvements and bug fixes** while adhering to project conventions
- Use **project structure reference** when suggesting edits or adding files
- Ensure **backend routes** (`routers/`) and **frontend components/pages** align with project functionality
- Suggest caching, indexing, or other **performance optimizations** as appropriate
- Preserve **guest access** (`owner_utils.py`) when touching Games/Repertoire/Analytics routes — don't reintroduce a hard login requirement on those paths without being asked

## Guidelines for Claude
- **Backend changes:** only modify `backend/` folder files; new API endpoints go in `routers/`
- **Frontend changes:** use `frontend/src/components/` for reusable UI, `pages/` for route-level screens
- **Database:** updates must go in `db.py` or router files; ensure proper indexing for performance
- **PGN parsing / analysis:** always in `backend/routers/games.py`, handle errors gracefully
- **UI/UX improvements:** prioritize minimal and chess-focused design; keep the White/Black toggle on Repertoire rather than splitting back into two pages, unless asked

## Cross-reference Hints
- Intended user flow: upload/import games (`Games.jsx`) → review `Analytics.jsx` to see weakest lines → jump into `Repertoire.jsx` to fix them. Keep this ordering in nav, homepage copy, and docs unless asked otherwise
- Upload/import PGN in frontend `Games.jsx` → triggers backend route `routers/games.py`, which also calls `repertoire_builder.py` to auto-update the tree
- Stats (win/loss/draw, weakest lines) and sunburst visualization are both computed/served by the backend and rendered together in `Analytics.jsx`; clicking a weak line or sunburst segment navigates to `/repertoire` with `location.state.moves`/`color` so that line loads and highlights automatically
- Adding a repertoire line in `Repertoire.jsx` → updates backend via `routers/openings.py` (White) or `routers/black_openings.py` (Black), selected by the page's color toggle
- Every route touching Games/Repertoire/Analytics data resolves its caller via `owner_utils.get_owner`, not a hard auth dependency — check there before assuming a route requires login

## Notes
- PGN parsing requires robust error handling
- Lichess Cloud Eval integration may need **API interaction checks**
- Avoid redundant instructions in code; focus on **efficiency and user experience**
- `.env` setup must be respected for backend/frontend configuration

## Planned / Not Yet Built
### Repertoire quiz mode (deferred follow-up to the Ideas panel)
Once the Ideas panel (stats/structure/plans, see Repertoire above) is live and validated, the next phase is a quiz feature to reinforce what it teaches. Deferred intentionally — build the content layer first, then test recall against it. Options discussed, not yet decided between:
- **Move recall** — "what does your repertoire play here?" against the user's own saved lines; fully generated from existing tree data, no new content pipeline needed, buildable independently of the rest of this list.
- **Structural-fact recognition** — "what pawn structure is this?" / "which square is the long-term outpost?", auto-generated from `motifs.classify_structure()` output.
- **Plan recall** — multiple-choice against the synthesized plan bullets in `motif_cache`; gated on that content existing for a line.
- **"Beat your own stats" drill** — spaced-repetition-style queue prioritized by `GET /openings/weaknesses` (lowest score first), wrapping any of the above question types.
