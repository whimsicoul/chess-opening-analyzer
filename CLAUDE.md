# Project: Chess Opening Analyzer Web

## Purpose
A personal chess improvement tool that connects to users’ game history, tracks adherence to their opening repertoire, and surfaces patterns in results. Claude should help with code development, debugging, performance optimization, and feature suggestions while maintaining project goals.

## Tech Stack
- **Frontend:** React 19 + Vite, chess.js, react-chessboard, recharts, d3, axios  
- **Backend:** FastAPI + uvicorn, python-chess, PostgreSQL (psycopg2-binary), python-jose + bcrypt

## Features
### Games
- Import games from Lichess/Chess.com or via PGN uploads (inline drag-and-drop on the Games page)
- Display in table: result, opening name, ECO code, both players' names  
- Full move-by-move board playback on game click  
- Uploading/importing games automatically builds/updates the user's opening repertoire tree (see Repertoire)

### Repertoire
- Build personal opening repertoire for White and Black — separate pages/routes for each  
- Auto-built from uploaded game history (most-played continuations), and merged with manually-added lines — manual lines are never overwritten  
- Add lines manually via interactive board or paste PGN  
- Lichess Cloud Eval panel shows top 3 engine moves with evaluation scores (falls back to local Stockfish WASM if unavailable)  
- Save lines with name and ECO code; visible in **White Repertoire ♔** and **Black Repertoire ♚**  
- Each repertoire page shows an auto-build status banner (last built, games count) with a manual "Rebuild from Games" action

### Stats & Visualization
- **Stats:** Win/draw/loss rates, plus a server-computed "Weakest Lines" table (win rate, avg. opponent rating, sample size per repertoire line)  
- **Visualization:** Interactive sunburst chart of saved repertoire, segments zoomable, hover shows opening names and ECO codes  

### Settings
- Connect Lichess/Chess.com usernames (auto-detects which side the user played on import)  
- Change username, email, password; delete account  

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
│ email_utils.py
│ # Email verification sending
│
│ routers/
│ auth.py
│ # Register, login, email verification, account settings, platform usernames
│ openings.py
│ # White repertoire CRUD, tree builder, status/rebuild, weaknesses, cloud-eval proxy
│ black_openings.py
│ # Black repertoire CRUD, tree builder, status/rebuild
│ games.py
│ # Game upload/import, deviation detection, triggers repertoire auto-build
│ repertoire_builder.py
│ # Shared helper (no APIRouter): builds/merges opening trees from a user's stored games
│
├── frontend/
│ # React frontend code, displays games, repertoire, analytics
│
│ src/
│ App.jsx
│ # Routes and main layout (/upload, /analytics kept as redirects for old links)
│ api.js
│ # Axios instance with JWT interceptors
│ context/
│ AuthContext.jsx
│ # Auth provider, context for frontend components
│ OnboardingContext.jsx
│ # Guided-tour state for new users
│ hooks/
│ useEngine.js
│ # Lichess Cloud Eval hook, falls back to local Stockfish WASM
│ components/
│ ProtectedRoute.jsx
│ # Route guard component for logged-in users
│ ChessBoardViewer.jsx
│ # Move-by-move chess board component
│ EyeIcon.jsx
│ # Shared show/hide password icon
│ Navbar.jsx
│ # Navigation bar
│ GuidanceModal.jsx / RepertoireWizard.jsx / wizardSteps.js
│ # Onboarding tour
│ OpeningSunburst.jsx
│ # Sunburst chart component
│ pages/
│ Home.jsx
│ # Homepage
│ Login.jsx / Register.jsx / VerifyEmail.jsx
│ # Auth pages
│ Games.jsx
│ # Game table view, playback, and inline PGN upload/drag-drop
│ WhiteRepertoire.jsx / BlackRepertoire.jsx
│ # Add/manage repertoire per color; auto-build status banner + rebuild control
│ Stats.jsx
│ # Win/loss/draw stats, weakest-lines breakdown
│ Visualization.jsx
│ # Sunburst chart visualization of opening tree
│ Settings.jsx
│ # Account info, connected accounts, security, delete account


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

## Guidelines for Claude
- **Backend changes:** only modify `backend/` folder files; new API endpoints go in `routers/`  
- **Frontend changes:** use `frontend/src/components/` for reusable UI, `pages/` for route-level screens  
- **Database:** updates must go in `db.py` or router files; ensure proper indexing for performance  
- **PGN parsing / analysis:** always in `backend/routers/games.py`, handle errors gracefully  
- **UI/UX improvements:** prioritize minimal and chess-focused design; keep both White and Black repertoire visible  

## Cross-reference Hints
- Upload/import PGN in frontend `Games.jsx` → triggers backend route `routers/games.py`, which also calls `repertoire_builder.py` to auto-update the tree  
- Adding a repertoire line in `WhiteRepertoire.jsx`/`BlackRepertoire.jsx` → updates backend via `routers/openings.py` / `routers/black_openings.py`  
- Stats (win/loss/draw, weakest lines) are computed in backend, displayed in `Stats.jsx`  
- Sunburst visualization data comes from backend repertoire → `Visualization.jsx` renders  

## Notes
- PGN parsing requires robust error handling  
- Lichess Cloud Eval integration may need **API interaction checks**  
- Avoid redundant instructions in code; focus on **efficiency and user experience**  
- `.env` setup must be respected for backend/frontend configuration