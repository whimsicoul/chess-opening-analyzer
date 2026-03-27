import { useEffect, useState, useCallback } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import api from '../api';
import './Repertoire.css';

// Convert a bare SAN moves array into a numbered PGN string: "1. e4 e5 2. Nf3 …"
function sanArrayToPgn(moves) {
  if (!moves.length) return null;
  return moves
    .map((m, i) => (i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ${m}` : m))
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

// Build a nested tree from the flat lines array (client-side fallback)
function buildTreeFromLines(lines) {
  const root = { name: 'start', id: 0, children: [] };
  const nodeMap = { 0: root };
  let nextId = 1;
  for (const line of lines) {
    const tokens = (line.moves || '').split(/\s+/).filter(Boolean);
    let parentId = 0;
    for (const san of tokens) {
      const existing = nodeMap[parentId].children.find(c => c.name === san);
      if (existing) {
        parentId = existing.id;
      } else {
        const node = { name: san, id: nextId++, opening_name: line.opening_name, eco_code: line.eco_code, children: [] };
        nodeMap[parentId].children.push(node);
        nodeMap[node.id] = node;
        parentId = node.id;
      }
    }
  }
  return root;
}

// Move label: "1. e4" for white (even depth), "1... e5" for black (odd depth)
function moveLabel(depth, san) {
  const num = Math.floor(depth / 2) + 1;
  return depth % 2 === 0 ? `${num}. ${san}` : `${num}... ${san}`;
}

function isPathActive(activePath, movePath) {
  return (
    activePath.length >= movePath.length &&
    activePath.slice(0, movePath.length).join(',') === movePath.join(',')
  );
}

// Recursive compact tree node — ChessTempo pairing style:
// Each row shows this move + its single child inline; branches nest below.
function TreeNode({ node, depth, pathMoves, onSelect, activePath }) {
  const [collapsed, setCollapsed] = useState(true);

  const myPath = [...pathMoves, node.name];
  const singleChild = node.children.length === 1 ? node.children[0] : null;
  const multiChildren = node.children.length > 1 ? node.children : [];
  const childPath = singleChild ? [...myPath, singleChild.name] : null;

  // What to render below this row
  const grandchildren = singleChild ? singleChild.children : [];
  const branchChildren = multiChildren.length > 0 ? multiChildren : grandchildren;
  const branchDepth = multiChildren.length > 0 ? depth + 1 : depth + 2;
  const branchBase = multiChildren.length > 0 ? myPath : childPath;
  const hasBranches = branchChildren.length > 0;

  return (
    <div className="tree-line">
      <div className="tree-run">
        {hasBranches && (
          <button
            className="tree-toggle"
            onClick={() => setCollapsed(c => !c)}
            aria-label={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? '+' : '−'}
          </button>
        )}
        <span
          className={`tree-move${isPathActive(activePath, myPath) ? ' tree-move-active' : ''}`}
          onClick={() => onSelect(myPath)}
          title={node.opening_name || undefined}
        >
          {moveLabel(depth, node.name)}
        </span>
        {singleChild && (
          <span
            className={`tree-move${isPathActive(activePath, childPath) ? ' tree-move-active' : ''}`}
            onClick={() => onSelect(childPath)}
            title={singleChild.opening_name || undefined}
          >
            {moveLabel(depth + 1, singleChild.name)}
          </span>
        )}
      </div>

      {!collapsed && hasBranches && (
        <div className="tree-branches">
          {branchChildren.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              depth={branchDepth}
              pathMoves={branchBase}
              onSelect={onSelect}
              activePath={activePath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function WhiteRepertoire() {
  const [lines, setLines]   = useState([]);
  const [tree,  setTree]    = useState(null);
  const [error, setError]   = useState(null);
  const [form, setForm]             = useState({ moves: '', opening_name: '', eco_code: '' });
  const [submitting, setSubmitting] = useState(false);

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

  // Load a position from the opening tree into the board
  function loadPosition(sanArray) {
    const g = buildBoard(sanArray, sanArray.length);
    setBoardGame(g);
    setAllMoves(sanArray);
    setStepIndex(sanArray.length);
    setInputText(sanArrayToPgn(sanArray) ?? '');
    setForm(f => ({ ...f, moves: sanArray.join(' ') }));
  }

  const resetBoard = useCallback(() => {
    setBoardGame(new Chess());
    setAllMoves([]);
    setStepIndex(0);
    setInputText('');
    setForm({ moves: '', opening_name: '', eco_code: '' });
    setEvalData(null);
  }, []);

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
      const res = await api.get('/openings/');
      setLines(res.data);
    } catch {
      setError('Failed to load openings.');
    }
  }

  async function fetchTree() {
    try {
      const res = await api.get('/openings/tree');
      setTree(res.data);
    } catch {
      setTree(null);
    }
  }

  useEffect(() => {
    fetchLines();
    fetchTree();
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

  // ECO lookup: auto-fill opening name + ECO code from Lichess whenever position changes
  useEffect(() => {
    if (stepIndex === 0) return;
    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/openings/eco-lookup', {
          params: { fen: boardGame.fen() },
        });
        if (res.data) {
          setForm(f => ({
            ...f,
            eco_code:     f.eco_code     || res.data.eco,
            opening_name: f.opening_name || res.data.name,
          }));
        }
      } catch { /* ignore */ }
    }, 600);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardGame]);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleAdd(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/openings/', { ...form, color: 'white' });
      setForm({ moves: '', opening_name: '', eco_code: '' });
      resetBoard();
      await fetchLines();
      await fetchTree();
    } catch {
      setError('Failed to add opening line.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/openings/${id}`);
      await fetchLines();
      await fetchTree();
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

  // ── Opening tree renderer ──────────────────────────────────────────────────

  function renderOpeningTree() {
    const displayTree = (tree && tree.children.length > 0) ? tree : buildTreeFromLines(lines);
    const isEmpty = displayTree.children.length === 0;

    return (
      <section className="rep-section">
        <div className="rep-section-header">
          <span className="badge badge-color-white">♔ White Opening Tree</span>
          <span className="rep-section-count muted">
            {lines.length} line{lines.length !== 1 ? 's' : ''}
          </span>
        </div>

        {isEmpty ? (
          <div className="card empty-state">
            <div className="empty-icon">♔</div>
            <p>No white opening lines yet. Add your first line above.</p>
          </div>
        ) : (
          <div className="opening-tree card">
            {displayTree.children.map(child => (
              <TreeNode
                key={child.id}
                node={child}
                depth={0}
                pathMoves={[]}
                onSelect={loadPosition}
                activePath={allMoves}
              />
            ))}
          </div>
        )}

        {lines.length > 0 && (
          <details className="tree-manage-lines">
            <summary>Manage saved lines ({lines.length})</summary>
            <ul className="tree-line-list">
              {lines.map(line => (
                <li key={line.id} className="tree-line-item">
                  <span className="tree-line-label">
                    {line.opening_name
                      ? <><strong>{line.opening_name}</strong>{line.eco_code ? ` (${line.eco_code})` : ''} — <code>{line.moves}</code></>
                      : <code>{line.moves}</code>
                    }
                  </span>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDelete(line.id)}
                    aria-label={`Delete ${line.opening_name || line.moves}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="page">
      <div className="page-header">
        <h1>White Repertoire ♔</h1>
        <p>Build your opening tree — play moves on the board, then save the line</p>
      </div>

      <form className="card add-form" onSubmit={handleAdd}>
        <div className="card-label">
          Add White ♔ Opening Line
        </div>

        <div className="rep-board-engine-row">
          <div className="rep-input-board">
            <Chessboard
              position={boardGame.fen()}
              onPieceDrop={onPieceDrop}
              boardWidth={480}
              boardOrientation="white"
              customDarkSquareStyle={{ backgroundColor: '#b58863' }}
              customLightSquareStyle={{ backgroundColor: '#f0d9b5' }}
            />
          </div>

          <div className="rep-right-col">
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
          </div>{/* rep-right-col */}
        </div>{/* rep-board-engine-row */}

        <div className="form-grid rep-meta-grid">
          <div className="field">
            <label htmlFor="rep-opening">Opening Name</label>
            <input
              id="rep-opening"
              placeholder="e.g. Sicilian Defense"
              value={form.opening_name}
              onChange={e => setForm(f => ({ ...f, opening_name: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="rep-eco">ECO Code</label>
            <input
              id="rep-eco"
              placeholder="e.g. B20"
              value={form.eco_code}
              onChange={e => setForm(f => ({ ...f, eco_code: e.target.value }))}
            />
          </div>
          <div className="field field-submit">
            <button className="btn" type="submit" disabled={submitting || stepIndex === 0}>
              {submitting ? 'Adding…' : '+ Add Line'}
            </button>
          </div>
        </div>
      </form>

      {error && <p className="msg-error">{error}</p>}

      {renderOpeningTree()}
    </main>
  );
}
