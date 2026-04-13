# Chess Opening Analyzer

A personal chess improvement tool for tracking opening repertoire adherence and analyzing game history.

**Live site:** https://chess-opening-analyzer.up.railway.app

## Features

- **Games** — Import from Lichess or upload a PGN; view results by opening/ECO with move-by-move board playback
- **Upload** — Drag-and-drop a single PGN to instantly analyze it against your repertoire; shows exactly where (and who) deviated
- **Repertoire** — Build opening lines for White and Black via interactive board; live Lichess Cloud Eval shows top 3 engine moves
- **Analytics** — Win/loss/draw rates, deviation tracker, and a zoomable sunburst chart of your opening tree
- **Onboarding wizard** — Guided setup walks new users through building their first White and Black repertoire
- **Settings** — Change username, email, or password; delete account

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19 + Vite, chess.js, react-chessboard, recharts, d3 |
| Backend | FastAPI + uvicorn, python-chess |
| Database | PostgreSQL — Neon (production) or local |
| Auth | JWT (python-jose + bcrypt) |
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

# Optional — email verification (Gmail: use App Password, not account password)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASSWORD=your_app_password
SMTP_FROM=your@gmail.com

# Optional — Lichess token (for import)
LICHESS_TOKEN=
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
│   ├── main.py             # App entrypoint, CORS, DB migration
│   ├── db.py               # PostgreSQL helpers (supports DATABASE_URL or individual vars)
│   ├── auth_utils.py       # JWT + password hashing
│   ├── migrate.py          # Schema migration runner
│   └── routers/
│       ├── auth.py         # Register, login, email verify, account settings
│       ├── openings.py     # White repertoire CRUD, tree builder, cloud-eval proxy
│       ├── black_openings.py  # Black repertoire CRUD + tree builder
│       └── games.py        # PGN upload/import, deviation detection
└── frontend/src/
    ├── App.jsx
    ├── api.js              # Axios + JWT interceptors
    ├── hooks/
    │   └── useEngine.js    # Lichess Cloud Eval hook
    ├── components/
    │   ├── ChessBoardViewer.jsx
    │   ├── GuidanceModal.jsx
    │   ├── Navbar.jsx
    │   ├── OpeningSunburst.jsx
    │   ├── ProtectedRoute.jsx
    │   ├── RepertoireWizard.jsx
    │   └── wizardSteps.js
    └── pages/
        ├── Home.jsx
        ├── Login.jsx / Register.jsx / VerifyEmail.jsx
        ├── Games.jsx
        ├── Upload.jsx          # Single-game PGN analyzer
        ├── WhiteRepertoire.jsx
        ├── BlackRepertoire.jsx
        ├── Analytics.jsx       # Tabs: Stats + Visualization
        ├── Stats.jsx
        ├── Visualization.jsx
        └── Settings.jsx
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `ModuleNotFoundError` | Activate venv: `venv\Scripts\activate` |
| PostgreSQL connection error | Check `.env` credentials and that the DB exists |
| Frontend can't reach backend | Verify `VITE_API_URL` port matches uvicorn; restart frontend after `.env` changes |
| Port in use / requests hang | Use `start.ps1` — `uvicorn --reload` spawns two processes; restarting without clearing ports causes conflicts |
| Email not arriving | Use a Gmail App Password, not your account password |
