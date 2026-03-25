# Chess Opening Analyzer Web

A personal chess improvement tool that connects to your game history, tracks how well you follow your opening repertoire, and surfaces patterns in your results.

---

## What It Does

### Games
Import your chess games from Lichess or by uploading PGN files. All games are stored in your account and displayed in a table with your result, opening name, ECO code, and both players' names. Click any game to view the full board with move-by-move playback.

### Repertoire
Build a personal opening repertoire for both White and Black. Use the color tabs to select which side you're adding a line for, then play moves directly on an interactive board or paste a PGN line into the text input. As you build a line, a **Lichess Cloud Eval** panel appears beside the board showing the top 3 engine moves with evaluation scores — click any suggestion to play it instantly. Save lines with a name and ECO code; they appear as cards organized into two clearly labeled sections — **White Repertoire ♔** and **Black Repertoire ♚** — always visible at the same time so you can manage both colors without switching tabs.

### Analytics — Stats
See your win/draw/loss rates broken down by result and filtered by the color you played. The deviation tracker shows which games went out of book: when a game departs from your saved repertoire, it records the move number, which side deviated, and whether it was you or your opponent. This makes it easy to see where your preparation ends in practice.

### Analytics — Visualization
An interactive sunburst chart of your opening tree, built from your saved repertoire lines. Each ring represents a move deeper into the opening. Click any segment to zoom in and explore that branch. Hover for opening names and ECO codes.

---

## Tech Stack

**Frontend** — React 19 + Vite, chess.js, react-chessboard, recharts, d3, axios

**Backend** — FastAPI + uvicorn, python-chess, PostgreSQL (psycopg2-binary), python-jose + bcrypt

---

## Prerequisites

- **Node.js** v18+
- **Python** 3.10+
- **PostgreSQL** running locally

---

## Setup

### 1. Clone the repo

```bash
git clone <repo-url>
cd chess-analyzer-web
```

### 2. Backend

```bash
cd backend

# Create and activate virtual environment
python -m venv venv

# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
```

Create `backend/.env`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_db_name
DB_USER=postgres
DB_PASSWORD=your_password

JWT_SECRET=your_secret_key_here
JWT_EXPIRE_DAYS=7

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password
SMTP_FROM=your_email@gmail.com

FRONTEND_URL=http://localhost:5173
```

> The database schema is created automatically on first startup. Just make sure the database itself exists: `createdb your_db_name`

### 3. Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:8001
```

---

## Running the App

### Recommended: start script (Windows)

From the project root:

```powershell
powershell -ExecutionPolicy Bypass -File start.ps1
```

Or right-click `start.ps1` → **Run with PowerShell**.

This kills any existing processes on ports 8001 and 5173, then opens both servers in new terminal windows. Use this every time to avoid port conflicts (see Troubleshooting below).

### Manual start

**Terminal 1 — Backend**
```bash
cd backend
venv\Scripts\activate
uvicorn main:app --reload --port 8001
```

**Terminal 2 — Frontend**
```bash
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Project Structure

```
chess-analyzer-web/
├── start.ps1                   # One-click start script (Windows)
├── backend/
│   ├── main.py                 # FastAPI app, CORS, startup DB migration
│   ├── db.py                   # PostgreSQL connection helper
│   ├── auth_utils.py           # JWT creation and validation
│   ├── email_utils.py          # Email verification sender
│   ├── seed_whimsicouls.py     # One-time seed: restores Whimsicoul's white repertoire (already applied)
│   ├── requirements.txt
│   └── routers/
│       ├── auth.py             # Register, login, email verify
│       ├── openings.py         # Repertoire CRUD, tree builder, cloud-eval proxy
│       └── games.py            # Game upload/import, deviation detection
└── frontend/
    └── src/
        ├── App.jsx             # Routes and layout
        ├── api.js              # Axios instance with JWT interceptors
        ├── context/
        │   └── AuthContext.jsx
        ├── components/
        │   ├── ProtectedRoute.jsx
        │   ├── ChessBoardViewer.jsx
        │   └── Navbar.jsx
        └── pages/
            ├── Home.jsx
            ├── Login.jsx
            ├── Register.jsx
            ├── VerifyEmail.jsx
            ├── Games.jsx
            ├── Repertoire.jsx
            ├── Analytics.jsx   # Tabs: Stats + Visualization
            ├── Stats.jsx
            └── Visualization.jsx
```

---

## Troubleshooting

**`ModuleNotFoundError` on backend start**
Activate the virtual environment first: `venv\Scripts\activate`

**PostgreSQL connection error**
Confirm PostgreSQL is running, check `backend/.env` credentials, and make sure the database exists.

**Frontend can't reach the backend**
Check that `VITE_API_URL` in `frontend/.env` matches the port uvicorn is running on. Restart the frontend after any `.env` change.

**Port already in use / all requests hang**
uvicorn `--reload` spawns two processes. Starting it a second time without stopping the first puts four processes competing for the port — connections are accepted but never answered. Always use `start.ps1`, which clears the ports before starting, to avoid this.

**Email verification not arriving**
If using Gmail, generate an App Password (Google Account → Security → 2-Step Verification → App Passwords) and use that as `SMTP_PASSWORD`, not your regular Gmail password.
