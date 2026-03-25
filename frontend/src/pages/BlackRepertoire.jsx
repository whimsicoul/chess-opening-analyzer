import { useEffect, useState, useCallback } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import api from '../api';
import ChessBoardViewer from '../components/ChessBoardViewer';
import './Repertoire.css';
import './BlackRepertoire.css';

// Convert a bare SAN moves array into a numbered PGN string: "1. e4 e5 2. Nf3 …"
function sanArrayToPgn(moves) {
  if (!moves.length) return null;
  return moves
    .map((m, i) => (i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ${m}` : m))
    .join(' ');
}

// Convert a moves string into a PGN string that chess.js loadPgn can parse.
function movesToPgn(moves) {
  if (!moves || !moves.trim()) return null;
  const trimmed = moves.trim();
  if (/^\d+\./.test(trimmed)) return trimmed;
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  return tokens
    .map((t, i) => (i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ${t}` : t))
    .join(' ');
}

// Format a centipawn value as "+0.3" / "-1.2" from white's perspective
function formatEval(cp, mate) {
  if (mate != null) return mate > 0 ? `M${mate}` : `M${mate}`;
  if (cp == null) return null;
  const val = (cp / 100).toFixed(1);
  return cp >= 0 ? `+${val}` : `${val}`;
}

// Convert a UCI move string to SAN given a Chess position
function uciToSan(fen, uci) {
  try {
    const game = new Chess(fen);
    const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
    return move ? move.san : uci;
  } catch {
    return uci;
  }
}

export default function BlackRepertoire() {
  const [lines, setLines]   = useState([]);
  const [error, setError]   = useState(null);
  const [form, setForm]             = useState({ moves: '', opening_name: '', eco_code: '' });
  const [submitting, setSubmitting] = useState(false);
  const [openBoards, setOpenBoards] = useState({});

  // Interactive input board state
  const [boardGame, setBoardGame] = useState(() => new Chess());
  const [allMoves,  setAllMoves]  = useState([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [inputText, setInputText] = useState('');

  // Engine state
  const [evalData,    setEvalData]    = useState(null);
  const [evalLoading, setEvalLoading] = useState(false);

  // ── Board helpers ──────────────────────────────────────────────────────────

  function buildBoard(moves, step) {
    const g = new Chess();
    for (let i = 0; i < step; i++) g.move(moves[i]);
    return g;
  }

  function _applyMoves(sanArray) {
    setAllMoves(sanArray);
    setStepIndex(sanArray.length);
    setInputText(sanArrayToPgn(sanArray) ?? '');
    setForm(f => ({ ...f, moves: sanArray.join(' ') }));
  }

  function onPieceDrop(sourceSquare, targetSquare) {
    const next = new Chess(boardGame.fen());
    try {
      const move = next.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
      if (!move) return false;
      setBoardGame(next);
      _applyMoves([...allMoves.slice(0, stepIndex), move.san]);
      return true;
    } catch {
      return false;
    }
  }

  function stepBack() {
    if (stepIndex === 0) return;
    const s = stepIndex - 1;
    setStepIndex(s);
    setBoardGame(buildBoard(allMoves, s));
    const cur = allMoves.slice(0, s);
    setInputText(sanArrayToPgn(cur) ?? '');
    setForm(f => ({ ...f, moves: cur.join(' ') }));
  }

  function stepForward() {
    if (stepIndex >= allMoves.length) return;
    const s = stepIndex + 1;
    setStepIndex(s);
    setBoardGame(buildBoard(allMoves, s));
    const cur = allMoves.slice(0, s);
    setInputText(sanArrayToPgn(cur) ?? '');
    setForm(f => ({ ...f, moves: cur.join(' ') }));
  }

  function handleMoveInput(e) {
    const val = e.target.value;
    setInputText(val);

    if (!val.trim()) {
      setBoardGame(new Chess());
      setAllMoves([]);
      setStepIndex(0);
      setForm(f => ({ ...f, moves: '' }));
      return;
    }

    const test = new Chess();
    try {
      test.loadPgn(val.trim());
      const moves = test.history();
      setBoardGame(test);
      setAllMoves(moves);
      setStepIndex(moves.length);
      setForm(f => ({ ...f, moves: moves.join(' ') }));
      return;
    } catch { /* fall through */ }

    const tokens = val.trim().split(/\s+/).filter(t => t && !/^\d+\./.test(t));
    const fallback = new Chess();
    const applied = [];
    for (const tok of tokens) {
      try {
        const m = fallback.move(tok);
        if (!m) break;
        applied.push(m.san);
      } catch { break; }
    }
    if (applied.length > 0) {
      setBoardGame(fallback);
      setAllMoves(applied);
      setStepIndex(applied.length);
      setForm(f => ({ ...f, moves: applied.join(' ') }));
    }
  }

  const resetBoard = useCallback(() => {
    setBoardGame(new Chess());
    setAllMoves([]);
    setStepIndex(0);
    setInputText('');
    setForm(f => ({ ...f, moves: '' }));
    setEvalData(null);
  }, []);

  function toggleBoard(id) {
    setOpenBoards(prev => ({ ...prev, [id]: !prev[id] }));
  }

  // Play a suggested engine move onto the board
  function playEngineMove(uciMove) {
    const next = new Chess(boardGame.fen());
    try {
      const move = next.move({ from: uciMove.slice(0, 2), to: uciMove.slice(2, 4), promotion: uciMove[4] || 'q' });
      if (!move) return;
      setBoardGame(next);
      _applyMoves([...allMoves.slice(0, stepIndex), move.san]);
    } catch { /* ignore invalid */ }
  }

  // ── Data fetching ──────────────────────────────────────────────────────────

  async function fetchLines() {
    try {
      const res = await api.get('/openings/', { params: { color: 'black' } });
      setLines(res.data);
    } catch {
      setError('Failed to load openings.');
    }
  }

  useEffect(() => {
    fetchLines();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Engine: fetch cloud eval whenever position changes (debounced 400ms)
  useEffect(() => {
    if (stepIndex === 0) {
      setEvalData(null);
      return;
    }
    setEvalLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/openings/cloud-eval', {
          params: { fen: boardGame.fen(), multiPv: 3 },
        });
        setEvalData(res.data ?? null);
      } catch {
        setEvalData(null);
      } finally {
        setEvalLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardGame]);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleAdd(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/openings/', { ...form, color: 'black' });
      setForm({ moves: '', opening_name: '', eco_code: '' });
      resetBoard();
      await fetchLines();
    } catch {
      setError('Failed to add opening line.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/openings/${id}`);
      setOpenBoards(prev => { const n = { ...prev }; delete n[id]; return n; });
      await fetchLines();
    } catch {
      setError('Failed to delete opening line.');
    }
  }

  // ── Derived engine display data ────────────────────────────────────────────

  const engineMoves = evalData?.pvs?.slice(0, 3).map(pv => {
    const uci  = pv.moves?.split(' ')[0] ?? '';
    const san  = uci ? uciToSan(boardGame.fen(), uci) : '';
    const eval_ = formatEval(pv.cp, pv.mate ?? null);
    return { uci, san, eval: eval_ };
  }) ?? [];

  const topEval = evalData?.pvs?.[0]
    ? formatEval(evalData.pvs[0].cp, evalData.pvs[0].mate ?? null)
    : null;

  const evalPositive = evalData?.pvs?.[0]?.cp != null
    ? evalData.pvs[0].cp >= 0
    : evalData?.pvs?.[0]?.mate != null
      ? evalData.pvs[0].mate > 0
      : true;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="page black-rep-page">
      <div className="page-header black-rep-header">
        <h1>Black Repertoire ♚</h1>
        <p>Manage your black opening lines</p>
      </div>

      <form className="card add-form" onSubmit={handleAdd}>
        <div className="card-label">
          Add Black ♚ Opening Line
        </div>

        <div className="rep-board-engine-row">
          {/* Interactive input board */}
          <div className="rep-input-board">
            <Chessboard
              position={boardGame.fen()}
              onPieceDrop={onPieceDrop}
              boardWidth={360}
              boardOrientation="black"
              customDarkSquareStyle={{ backgroundColor: '#2d2d2d' }}
              customLightSquareStyle={{ backgroundColor: '#9e9e9e' }}
            />
          </div>

          {/* Engine panel */}
          {stepIndex > 0 && (
            <div className="engine-panel">
              <div className="engine-header">
                <span className="engine-title">Cloud Eval</span>
                {evalLoading && <span className="engine-loading">…</span>}
                {!evalLoading && topEval && (
                  <span className={`eval-score${evalPositive ? ' eval-pos' : ' eval-neg'}`}>
                    {topEval}
                  </span>
                )}
              </div>

              {!evalLoading && engineMoves.length > 0 && (
                <ul className="engine-moves">
                  {engineMoves.map((m, i) => (
                    <li key={i} className="engine-move-row">
                      <span className="engine-move-san">{m.san}</span>
                      <span className="engine-move-eval muted">{m.eval}</span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-play"
                        onClick={() => playEngineMove(m.uci)}
                      >
                        ▶ Play
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {!evalLoading && engineMoves.length === 0 && (
                <p className="engine-empty muted">Position not in cloud database</p>
              )}
            </div>
          )}
        </div>

        {/* Back / Forward navigation */}
        <div className="rep-nav-bar">
          <button
            type="button"
            className="btn btn-ghost btn-step"
            onClick={stepBack}
            disabled={stepIndex === 0}
            aria-label="Previous move"
          >
            ← Back
          </button>
          <span className="rep-step-counter muted">
            {stepIndex === 0
              ? 'Start'
              : `Move ${stepIndex}${allMoves.length > stepIndex ? ` / ${allMoves.length}` : ''}`}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-step"
            onClick={stepForward}
            disabled={stepIndex >= allMoves.length}
            aria-label="Next move"
          >
            Forward →
          </button>
        </div>

        {/* Move preview / paste input */}
        <div className="rep-move-preview">
          <input
            className="rep-move-input"
            type="text"
            placeholder="Play moves on the board above, or paste a line here…"
            value={inputText}
            onChange={handleMoveInput}
            spellCheck={false}
            autoComplete="off"
            aria-label="Opening line moves"
          />
          {stepIndex > 0 && (
            <button type="button" className="btn btn-ghost" onClick={resetBoard}>
              Reset
            </button>
          )}
        </div>

        <div className="form-grid rep-meta-grid">
          <div className="field">
            <label htmlFor="black-rep-opening">Opening Name</label>
            <input
              id="black-rep-opening"
              placeholder="e.g. Sicilian Defense"
              value={form.opening_name}
              onChange={e => setForm(f => ({ ...f, opening_name: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="black-rep-eco">ECO Code</label>
            <input
              id="black-rep-eco"
              placeholder="e.g. B20"
              value={form.eco_code}
              onChange={e => setForm(f => ({ ...f, eco_code: e.target.value }))}
            />
          </div>
          <div className="field field-submit">
            <button className="btn black-rep-btn" type="submit" disabled={submitting || stepIndex === 0}>
              {submitting ? 'Adding…' : '+ Add Line'}
            </button>
          </div>
        </div>
      </form>

      {error && <p className="msg-error">{error}</p>}

      <section className="rep-section">
        <div className="rep-section-header">
          <span className="badge badge-color-black">♚ Black</span>
          <span className="rep-section-count muted">{lines.length} line{lines.length !== 1 ? 's' : ''}</span>
        </div>

        {lines.length === 0 ? (
          <div className="card empty-state">
            <div className="empty-icon">♚</div>
            <p>No black opening lines yet. Add your first line above.</p>
          </div>
        ) : (
          <div className="lines-grid">
            {lines.map(line => {
              const pgn       = movesToPgn(line.moves);
              const boardOpen = !!openBoards[line.id];
              const lineLabel = line.opening_name
                ? `${line.opening_name}${line.eco_code ? ` (${line.eco_code})` : ''}`
                : `Line ${line.id}`;

              return (
                <div
                  key={line.id}
                  className={`line-card black-line-card${boardOpen ? ' line-card-expanded' : ''}`}
                >
                  <div className="line-card-top">
                    <div className="line-card-badges">
                      <span className="badge badge-color-black">♚</span>
                      {line.eco_code && (
                        <span className="badge badge-eco">{line.eco_code}</span>
                      )}
                    </div>
                    <div className="line-card-actions">
                      {pgn && (
                        <button
                          className="btn btn-ghost btn-view"
                          onClick={() => toggleBoard(line.id)}
                          aria-expanded={boardOpen}
                          aria-controls={`black-rep-board-${line.id}`}
                          aria-label={boardOpen ? `Hide board for ${lineLabel}` : `Show board for ${lineLabel}`}
                        >
                          {boardOpen ? 'Hide ↑' : 'Board ↓'}
                        </button>
                      )}
                      <button
                        className="btn btn-danger"
                        onClick={() => handleDelete(line.id)}
                        aria-label={`Delete ${lineLabel}`}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <div className="line-name">
                    {line.opening_name ?? <span className="muted">Unnamed line</span>}
                  </div>
                  <div className="line-move">
                    <code>{line.moves}</code>
                  </div>
                  <div className="line-meta muted">ID {line.id}</div>

                  {boardOpen && pgn && (
                    <div
                      id={`black-rep-board-${line.id}`}
                      className="rep-board-panel"
                      role="region"
                      aria-label={`Chessboard showing position for ${lineLabel}`}
                    >
                      <ChessBoardViewer pgn={pgn} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
