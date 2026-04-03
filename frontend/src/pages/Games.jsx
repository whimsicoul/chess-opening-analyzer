import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../api';
import ChessBoardViewer from '../components/ChessBoardViewer';
import RepertoireWizard from '../components/RepertoireWizard';
import { GAMES_WIZARD_STEPS } from '../components/wizardSteps';
import { useOnboarding } from '../context/OnboardingContext';
import './Games.css';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sinceMs(months) {
  return Date.now() - months * 30 * 24 * 60 * 60 * 1000;
}

function lichessResult(g) {
  if (!g.winner) return '½-½';
  return g.winner === 'white' ? '1-0' : '0-1';
}

function chessComResult(g) {
  const w = g.white?.result;
  if (w === 'win') return '1-0';
  if (g.black?.result === 'win') return '0-1';
  return '½-½';
}

function toHighlightIndex(moveNumber, deviatedBy) {
  if (moveNumber == null || deviatedBy == null) return null;
  return (moveNumber - 1) * 2 + (deviatedBy === 'black' ? 2 : 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// API fetchers
// ─────────────────────────────────────────────────────────────────────────────

async function fetchFromLichess(username, months, gameType) {
  const since = sinceMs(months);
  const perfParam = gameType !== 'all' ? `&perfType=${gameType}` : '';
  const url =
    `https://lichess.org/api/games/user/${encodeURIComponent(username)}` +
    `?since=${since}&max=50&pgnInJson=true${perfParam}`;
  const res = await fetch(url, { headers: { Accept: 'application/x-ndjson' } });
  if (!res.ok) throw new Error(`Lichess API returned ${res.status}`);
  const text = await res.text();
  const games = text.trim().split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(g => {
    if (!g || !g.pgn) { console.warn('[Lichess] skipping game without PGN:', g?.id); return false; }
    return true;
  });
  return games.map(g => ({
    id:        `lichess-${g.id}`,
    source:    'lichess',
    white:     g.players?.white?.user?.name ?? 'White',
    black:     g.players?.black?.user?.name ?? 'Black',
    result:    lichessResult(g),
    timeClass: g.perf ?? g.speed ?? '—',
    pgn:       g.pgn,
    date:      g.createdAt ? new Date(g.createdAt).toISOString().slice(0, 10) : '—',
  }));
}

async function fetchFromChessCom(username, months, gameType) {
  const since = sinceMs(months);
  const archRes = await fetch(
    `https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/games/archives`
  );
  if (!archRes.ok) throw new Error(`Chess.com API returned ${archRes.status}`);
  const { archives } = await archRes.json();

  // Keep only archives within the time window (by YYYY/MM in URL)
  const relevant = (archives ?? []).filter(url => {
    const parts = url.split('/');
    const yr = parseInt(parts[parts.length - 2], 10);
    const mo = parseInt(parts[parts.length - 1], 10);
    return new Date(yr, mo, 1).getTime() >= since;
  });

  const allGames = [];
  for (const archUrl of relevant) {
    try {
      const r = await fetch(archUrl);
      if (!r.ok) { console.warn('[Chess.com] archive fetch failed:', archUrl); continue; }
      const { games } = await r.json();
      allGames.push(...(games ?? []));
    } catch (err) {
      console.warn('[Chess.com] archive error:', archUrl, err);
    }
  }

  return allGames
    .filter(g => {
      if (!g.pgn) { console.warn('[Chess.com] skipping game without PGN'); return false; }
      if (gameType !== 'all' && g.time_class !== gameType) return false;
      if (g.end_time && g.end_time * 1000 < since) return false;
      return true;
    })
    .slice(0, 50)
    .map(g => ({
      id:        `chesscom-${g.url?.split('/').pop() ?? Math.random().toString(36).slice(2)}`,
      source:    'chesscom',
      white:     g.white?.username ?? 'White',
      black:     g.black?.username ?? 'Black',
      result:    chessComResult(g),
      timeClass: g.time_class ?? '—',
      pgn:       g.pgn,
      date:      g.end_time ? new Date(g.end_time * 1000).toISOString().slice(0, 10) : '—',
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function SourceBadge({ source }) {
  const map = {
    lichess:  { label: 'Lichess',   cls: 'src-lichess'  },
    chesscom: { label: 'Chess.com', cls: 'src-chesscom' },
    upload:   { label: 'Uploaded',  cls: 'src-upload'   },
  };
  const { label, cls } = map[source] ?? { label: source, cls: '' };
  return <span className={`source-badge ${cls}`}>{label}</span>;
}

function DeviationBadge({ opponentDeviation }) {
  if (opponentDeviation == null) return <span className="badge badge-green">✓ In book</span>;
  if (opponentDeviation)         return <span className="badge badge-amber">⚡ Opponent</span>;
  return                                <span className="badge badge-red">✕ You</span>;
}

// ── Filter section ────────────────────────────────────────────────────────────

function FilterSection({ onFetch, loading }) {
  const [source,    setSource]    = useState('all');
  const [username,  setUsername]  = useState('');
  const [timeRange, setTimeRange] = useState(1);
  const [gameType,  setGameType]  = useState('all');

  function handleSubmit(e) {
    e.preventDefault();
    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      alert('Please enter a username');
      return;
    }
    onFetch({ source, username: trimmedUsername, months: timeRange, gameType });
  }

  return (
    <form className="card filter-card" onSubmit={handleSubmit} aria-label="Fetch games filters">
      <div className="card-label">Fetch Games</div>
      <div className="filter-grid">
        <div className="field">
          <label htmlFor="f-source">Source</label>
          <select id="f-source" value={source} onChange={e => setSource(e.target.value)}>
            <option value="all">All sources</option>
            <option value="lichess">Lichess only</option>
            <option value="chesscom">Chess.com only</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="f-username">Username</label>
          <input
            id="f-username"
            placeholder="e.g. MagnusCarlsen"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="off"
            required={source !== 'all' || username.length > 0}
          />
        </div>

        <div className="field">
          <label htmlFor="f-range">Time Range</label>
          <select id="f-range" value={timeRange} onChange={e => setTimeRange(Number(e.target.value))}>
            <option value={1}>Last month</option>
            <option value={3}>Last 3 months</option>
            <option value={6}>Last 6 months</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="f-type">Game Type</label>
          <select id="f-type" value={gameType} onChange={e => setGameType(e.target.value)}>
            <option value="all">All types</option>
            <option value="bullet">Bullet</option>
            <option value="blitz">Blitz</option>
            <option value="rapid">Rapid</option>
          </select>
        </div>

        <div className="field field-submit">
          <button className="btn" type="submit" disabled={loading}>
            {loading ? 'Fetching…' : 'Fetch Games'}
          </button>
        </div>
      </div>
    </form>
  );
}

// ── Upload section ────────────────────────────────────────────────────────────

function UploadSection({ onGameAnalyzed }) {
  const [open,      setOpen]      = useState(false);
  const [file,      setFile]      = useState(null);
  const [pgnText,   setPgnText]   = useState(null);
  const [dragging,  setDragging]  = useState(false);
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState(null);
  const [loading,   setLoading]   = useState(false);
  const inputRef = useRef(null);

  function pickFile(f) {
    if (f && (f.name.endsWith('.pgn') || f.type === 'text/plain')) {
      setFile(f);
      setResult(null);
      setError(null);
      setPgnText(null);
      f.text().then(t => setPgnText(t));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setResult(null);
    setError(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.post('/games/upload', fd);
      setResult(res.data);
      onGameAnalyzed?.();
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Upload failed.');
    } finally {
      setLoading(false);
    }
  }

  const noDeviation = result && result.deviation_move_number == null;
  const opponentDev = result?.deviated_by === 'black';
  const highlightIndex  = result ? toHighlightIndex(result.deviation_move_number, result.deviated_by) : null;
  const deviationColor  = opponentDev ? 'amber' : 'red';
  const deviationLabel  = result && !noDeviation
    ? `${opponentDev ? 'Opponent deviated' : 'You deviated'} on move ${result.deviation_move_number}: ${result.game_move}`
    : null;

  return (
    <section className="upload-section" aria-labelledby="upload-heading">
      <button
        className="card upload-toggle"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls="upload-body"
        id="upload-heading"
      >
        <span>⬆ Upload &amp; Analyze PGN</span>
        <span className="upload-toggle-arrow">{open ? '↑' : '↓'}</span>
      </button>

      {open && (
        <div id="upload-body" className="card upload-body">
          <form onSubmit={handleSubmit}>
            <div
              className={`dropzone ${dragging ? 'dropzone-active' : ''} ${file ? 'dropzone-ready' : ''}`}
              role="button"
              tabIndex={0}
              aria-label="Drop PGN file here or click to browse"
              onClick={() => inputRef.current.click()}
              onKeyDown={e => e.key === 'Enter' && inputRef.current.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files[0]); }}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pgn,text/plain"
                style={{ display: 'none' }}
                onChange={e => pickFile(e.target.files[0])}
                aria-hidden="true"
              />
              <div className="dropzone-icon" aria-hidden="true">{file ? '✓' : '⬆'}</div>
              {file ? (
                <>
                  <p className="dropzone-filename">{file.name}</p>
                  <p className="dropzone-hint">Click to choose a different file</p>
                </>
              ) : (
                <>
                  <p className="dropzone-text">Drop your PGN file here</p>
                  <p className="dropzone-hint">or click to browse</p>
                </>
              )}
            </div>

            <button className="btn upload-btn" type="submit" disabled={loading || !file}>
              {loading ? 'Analyzing…' : 'Analyze Game'}
            </button>
          </form>

          {error && <div className="msg-error" role="alert">⚠ {error}</div>}

          {result && (
            <div
              className={`result-card ${noDeviation ? 'result-green' : opponentDev ? 'result-amber' : 'result-red'}`}
              role="region"
              aria-label="Analysis result"
            >
              <div className="result-card-header">
                <span className={`badge ${noDeviation ? 'badge-green' : opponentDev ? 'badge-amber' : 'badge-red'}`}>
                  {noDeviation ? '✓ In Repertoire' : opponentDev ? '⚡ Opponent Deviated' : '✕ You Deviated'}
                </span>
                <span className="result-game-id muted">Game #{result.game_id}</span>
              </div>
              {noDeviation ? (
                <p className="result-clean-msg">The game stayed within your prepared lines.</p>
              ) : (
                <div className="result-row">
                  <div className="result-field">
                    <span className="result-field-label">Deviated by</span>
                    <span className="result-field-value" style={{ textTransform: 'capitalize' }}>
                      {result.deviated_by}
                    </span>
                  </div>
                  <div className="result-field">
                    <span className="result-field-label">On move</span>
                    <span className="result-field-value">{result.deviation_move_number}</span>
                  </div>
                  <div className="result-field">
                    <span className="result-field-label">Move played</span>
                    <code style={{ fontSize: '1rem' }}>{result.game_move}</code>
                  </div>
                  {result.expected_moves?.length > 0 && (
                    <div className="result-field">
                      <span className="result-field-label">Expected</span>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.15rem' }}>
                        {result.expected_moves.map(m => <code key={m}>{m}</code>)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {result && pgnText && (
            <div
              role="region"
              aria-label={`Chessboard for uploaded game #${result.game_id}`}
              className="upload-board"
            >
              <ChessBoardViewer
                pgn={pgnText}
                highlightIndex={highlightIndex}
                deviationColor={deviationColor}
                deviationLabel={deviationLabel}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ── Individual game card ──────────────────────────────────────────────────────

function GameCard({ game, expanded, onToggle, loadingDetail, detail }) {
  const label = `${game.white} vs ${game.black} — ${game.result}`;

  // For fetched games (lichess/chesscom) PGN is already in game.pgn
  // For upload games, PGN comes from backend detail fetch
  const pgn = game.pgn ?? detail?.pgn ?? null;

  const highlightIndex = game.source === 'upload'
    ? (detail ? toHighlightIndex(detail.move_number, detail.deviated_by ?? (detail.opponent_deviation ? 'black' : 'white')) : null)
    : null;
  const deviationColor = game.source === 'upload'
    ? (detail?.opponent_deviation ? 'amber' : 'red')
    : null;
  const deviationLabel = game.source === 'upload' && detail?.move_number != null && detail?.opponent_deviation != null
    ? `${detail.opponent_deviation ? 'Opponent deviated' : 'You deviated'} on move ${detail.move_number}: ${detail.move_uci}`
    : null;

  return (
    <div className={`game-card ${expanded ? 'game-card-open' : ''}`} role="listitem">
      <div className="game-card-header">
        <div className="game-card-meta">
          <SourceBadge source={game.source} />
          <span className="game-players" aria-label={label}>
            <strong>{game.white}</strong>
            <span className="vs-sep" aria-hidden="true"> vs </span>
            <strong>{game.black}</strong>
          </span>
          <span
            className={`result-pill result-${game.result.replace(/[^01½*]/g, '')}`}
            aria-label={`Result: ${game.result}`}
          >
            {game.result}
          </span>
          {game.timeClass && game.timeClass !== '—' && (
            <span className="badge badge-eco">{game.timeClass}</span>
          )}
          {game.source === 'upload' && game.opponentDeviation !== undefined && (
            <DeviationBadge opponentDeviation={game.opponentDeviation} />
          )}
          <span className="game-date muted">{game.date}</span>
          {game.openingName && (
            <span className="game-opening muted">{game.openingName}</span>
          )}
        </div>
        <button
          className="btn btn-ghost btn-view"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={`board-${game.id}`}
          aria-label={expanded ? `Hide board for ${label}` : `Show board for ${label}`}
        >
          {expanded ? 'Hide ↑' : 'View ↓'}
        </button>
      </div>

      {expanded && (
        <div
          id={`board-${game.id}`}
          className="game-board-panel"
          role="region"
          aria-label={`Chessboard showing position for ${label}`}
        >
          {loadingDetail ? (
            <p className="muted" style={{ padding: '0.5rem 0' }}>Loading…</p>
          ) : !pgn ? (
            <p className="muted" style={{ padding: '0.5rem 0' }}>No PGN available for this game.</p>
          ) : (
            <ChessBoardViewer
              pgn={pgn}
              highlightIndex={highlightIndex}
              deviationColor={deviationColor}
              deviationLabel={deviationLabel}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Games page
// ─────────────────────────────────────────────────────────────────────────────

export default function Games() {
  // Uploaded/analyzed games from backend
  const [uploadedGames, setUploadedGames] = useState([]);
  const [uploadedDetails, setUploadedDetails] = useState({});
  const [uploadedError, setUploadedError] = useState(null);

  // Fetched games from Lichess / Chess.com
  const [fetchedGames, setFetchedGames] = useState([]);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [fetchedUsername, setFetchedUsername] = useState('');

  // Import / clear state
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [clearLoading, setClearLoading] = useState(false);

  // Board expand state
  const [expandedId, setExpandedId]     = useState(null);
  const [loadingDetailId, setLoadingDetailId] = useState(null);

  // Wizard state
  const { tourActive, tourStep } = useOnboarding();
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardDismissed, setWizardDismissed] = useState(
    () => localStorage.getItem('wizard_games_seen') === '1'
  );

  // When the tour brings us to the games step, reset the wizard
  useEffect(() => {
    if (tourActive && tourStep === 5) {
      setWizardDismissed(false);
      setWizardStep(0);
      localStorage.removeItem('wizard_games_seen');
    }
  }, [tourActive, tourStep]);

  // Load uploaded games on mount
  const loadUploadedGames = useCallback(() => {
    api.get('/games/')
      .then(res => {
        setUploadedGames(
          res.data.map(g => ({
            id:               `upload-${g.id}`,
            _backendId:       g.id,
            source:           'upload',
            white:            g.white_player ?? '—',
            black:            g.black_player ?? '—',
            result:           g.result ?? '—',
            timeClass:        null,
            pgn:              null,
            date:             g.game_date ?? '—',
            openingName:      g.opening_name,
            ecoCode:          g.eco_code,
            opponentDeviation: g.opponent_deviation,
            moveNumber:       g.move_number,
            moveUci:          g.move_uci,
          }))
        );
      })
      .catch(() => setUploadedError('Failed to load analyzed games.'));
  }, []);

  useEffect(() => { loadUploadedGames(); }, [loadUploadedGames]);

  // Toggle board expand — lazy-load backend details for uploaded games
  const handleToggle = useCallback(async (game) => {
    const id = game.id;
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);

    if (game.source !== 'upload') return; // fetched games have PGN already
    if (uploadedDetails[id]) return;       // already cached

    setLoadingDetailId(id);
    try {
      const res = await api.get(`/games/${game._backendId}`);
      setUploadedDetails(prev => ({ ...prev, [id]: res.data }));
    } catch {
      setUploadedDetails(prev => ({ ...prev, [id]: null }));
      console.warn('[Games] failed to load detail for game:', game._backendId);
    } finally {
      setLoadingDetailId(null);
    }
  }, [expandedId, uploadedDetails]);

  // Import fetched games into backend
  async function handleImport() {
    setImportLoading(true);
    setImportResult(null);
    const pgns = fetchedGames.filter(g => g.pgn).map(g => g.pgn);
    try {
      const res = await api.post('/games/import', { pgns, username: fetchedUsername });
      setImportResult(res.data);
      loadUploadedGames();
    } catch (err) {
      setImportResult({ error: err.response?.data?.detail ?? 'Import failed.' });
    } finally {
      setImportLoading(false);
    }
  }

  // Clear all saved games from backend
  async function handleClear() {
    if (!window.confirm('Delete all saved games from the backend? This cannot be undone.')) return;
    setClearLoading(true);
    try {
      await api.delete('/games/');
      loadUploadedGames();
      setImportResult(null);
    } finally {
      setClearLoading(false);
    }
  }

  // Fetch from external APIs
  async function handleFetch({ source, username, months, gameType }) {
    if (!username) return;
    setFetchLoading(true);
    setFetchError(null);
    setFetchedGames([]);
    setExpandedId(null);
    setImportResult(null);
    setFetchedUsername(username);

    const tasks = [];
    if (source === 'all' || source === 'lichess')  tasks.push(fetchFromLichess(username, months, gameType).catch(e => { console.error('[Lichess]', e); return []; }));
    if (source === 'all' || source === 'chesscom') tasks.push(fetchFromChessCom(username, months, gameType).catch(e => { console.error('[Chess.com]', e); return []; }));

    try {
      const results = await Promise.all(tasks);
      const combined = results.flat().sort((a, b) => (b.date > a.date ? 1 : -1));
      if (combined.length === 0) setFetchError('No games found. Check the username or try a wider time range.');
      setFetchedGames(combined);
      // Trigger wizard advancement when games are fetched
      if (combined.length > 0) {
        setWizardStep(s => s + 1);
      }
    } catch (err) {
      setFetchError(err.message || 'Failed to fetch games.');
    } finally {
      setFetchLoading(false);
    }
  }

  // Combine all games: fetched first (newest), then uploaded
  const allGames = [...fetchedGames, ...uploadedGames];

  return (
    <main className="page">
      <div className="page-header">
        <h1>Games</h1>
        <p>Fetch, upload, and analyze your chess games</p>
      </div>

      {!wizardDismissed && wizardStep < GAMES_WIZARD_STEPS.length && (
        <RepertoireWizard
          steps={GAMES_WIZARD_STEPS}
          stepIndex={wizardStep}
          onAdvance={() => setWizardStep(s => s + 1)}
          onDismiss={() => {
            setWizardDismissed(true);
            localStorage.setItem('wizard_games_seen', '1');
            window.dispatchEvent(new CustomEvent('wizard-complete', { detail: 'games' }));
          }}
        />
      )}

      <FilterSection onFetch={handleFetch} loading={fetchLoading} />

      {fetchError && <div className="msg-error" role="alert">⚠ {fetchError}</div>}

      {fetchedGames.length > 0 && (
        <div className="card import-bar">
          <span className="muted" style={{ fontSize: '0.9rem' }}>
            {fetchedGames.length} game{fetchedGames.length !== 1 ? 's' : ''} fetched from {fetchedUsername}
          </span>
          <button
            className="btn"
            onClick={handleImport}
            disabled={importLoading}
          >
            {importLoading ? 'Importing…' : `Save ${fetchedGames.length} games to backend`}
          </button>
        </div>
      )}

      {importResult && !importResult.error && (
        <div className="msg-success" role="status">
          Imported {importResult.imported} game{importResult.imported !== 1 ? 's' : ''}
          {importResult.errors?.length > 0 && ` (${importResult.errors.length} skipped)`}.
        </div>
      )}
      {importResult?.error && (
        <div className="msg-error" role="alert">⚠ {importResult.error}</div>
      )}

      <UploadSection onGameAnalyzed={loadUploadedGames} />

      {uploadedError && <div className="msg-error" role="alert">⚠ {uploadedError}</div>}

      <section aria-label="Games list" className="games-list-section">
        <div className="games-list-header">
          <h2>
            {allGames.length === 0
              ? 'No games'
              : `${allGames.length} game${allGames.length !== 1 ? 's' : ''}`}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {fetchedGames.length > 0 && (
              <span className="muted" style={{ fontSize: '0.82rem' }}>
                {fetchedGames.length} fetched · {uploadedGames.length} saved
              </span>
            )}
            {uploadedGames.length > 0 && (
              <button
                className="btn btn-ghost btn-danger"
                onClick={handleClear}
                disabled={clearLoading}
                style={{ fontSize: '0.82rem', padding: '0.3rem 0.75rem' }}
              >
                {clearLoading ? 'Clearing…' : 'Clear saved games'}
              </button>
            )}
          </div>
        </div>

        {allGames.length === 0 ? (
          <div className="card empty-state" style={{ padding: '3rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', opacity: 0.25, marginBottom: '0.75rem' }}>◑</div>
            <p className="muted">Fetch games from Lichess or Chess.com, or upload a PGN above.</p>
          </div>
        ) : (
          <div className="games-list" role="list">
            {allGames.map(game => (
              <GameCard
                key={game.id}
                game={game}
                expanded={expandedId === game.id}
                onToggle={() => handleToggle(game)}
                loadingDetail={loadingDetailId === game.id}
                detail={uploadedDetails[game.id]}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
