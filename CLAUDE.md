# Project: Chess Opening Analyzer Web

## Purpose
A personal chess improvement tool that connects to users’ game history, tracks adherence to their opening repertoire, and surfaces patterns in results. Claude should help with code development, debugging, performance optimization, and feature suggestions while maintaining project goals.

## Tech Stack
- **Frontend:** React 19 + Vite, chess.js, react-chessboard, recharts, d3, axios  
- **Backend:** FastAPI + uvicorn, python-chess, PostgreSQL (psycopg2-binary), python-jose + bcrypt

## Features
### Games
- Import games from Lichess or via PGN uploads  
- Display in table: result, opening name, ECO code, both players’ names  
- Full move-by-move board playback on game click  

### Repertoire
- Build personal opening repertoire for White and Black  
- Add lines via interactive board or paste PGN  
- Lichess Cloud Eval panel shows top 3 engine moves with evaluation scores  
- Save lines with name and ECO code; visible in **White Repertoire ♔** and **Black Repertoire ♚**  

### Analytics
- **Stats:** Win/draw/loss rates, deviation tracking from repertoire  
- **Visualization:** Interactive sunburst chart of saved repertoire, segments zoomable, hover shows opening names and ECO codes  

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
│ seed_whimsicouls.py
│ # One-time seed: restores Whimsicoul's white repertoire
│
│ routers/
│ auth.py
│ # Register, login, email verification routes
│ openings.py
│ # Repertoire CRUD, tree builder, cloud-eval proxy
│ games.py
│ # Game upload/import, deviation detection
│
├── frontend/
│ # React frontend code, displays games, repertoire, analytics
│
│ src/
│ App.jsx
│ # Routes and main layout
│ api.js
│ # Axios instance with JWT interceptors
│ context/
│ AuthContext.jsx
│ # Auth provider, context for frontend components
│ components/
│ ProtectedRoute.jsx
│ # Route guard component for logged-in users
│ ChessBoardViewer.jsx
│ # Move-by-move chess board component
│ Navbar.jsx
│ # Navigation bar
│ pages/
│ Home.jsx
│ # Homepage
│ Login.jsx
│ # Login page
│ Register.jsx
│ # Register page
│ VerifyEmail.jsx
│ # Email verification page
│ Games.jsx
│ # Game table view and playback
│ Repertoire.jsx
│ # Add/manage repertoire for White & Black
│ Analytics.jsx
│ # Tabs for Stats + Visualization
│ Stats.jsx
│ # Win/loss/draw stats, deviation tracker
│ Visualization.jsx
│ # Sunburst chart visualization of opening tree


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
- Upload PGN in frontend `Games.jsx` → triggers backend route `routers/games.py`  
- Adding repertoire line in `Repertoire.jsx` → updates backend via `routers/openings.py`  
- Analytics stats are computed in backend, displayed in `Stats.jsx`  
- Sunburst visualization data comes from backend repertoire → `Visualization.jsx` renders  

## Notes
- PGN parsing requires robust error handling  
- Lichess Cloud Eval integration may need **API interaction checks**  
- Avoid redundant instructions in code; focus on **efficiency and user experience**  
- `.env` setup must be respected for backend/frontend configuration