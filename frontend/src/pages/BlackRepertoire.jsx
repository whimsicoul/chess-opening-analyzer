import { useEffect, useState, useCallback, useRef } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { woodenPieces } from '../utils/woodenPieces.jsx';
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

// Format game count: 12345 -> "12.3K", 980 -> "980"
function formatGameCount(n) {
  if (n == null) return '0';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

// Compute W/D/L percentages for a move row
function wdlPercents(white, draws, black) {
  const total = (white ?? 0) + (draws ?? 0) + (black ?? 0);
  if (total === 0) return { w: 0, d: 0, l: 0, total: 0 };
  return { w: (white / total) * 100, d: (draws / total) * 100, l: (black / total) * 100, total };
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

// Coach banner shown during repertoire construction
function CoachBanner({ children, onDismiss }) {
  return (
    <div className="coach-banner">
      <span className="coach-icon">🎓</span>
      <p className="coach-message">{children}</p>
      <button className="coach-dismiss" onClick={onDismiss} aria-label="Dismiss coach">✕</button>
    </div>
  );
}

// Recursive compact tree node — ChessTempo pairing style
function TreeNode({ node, depth, pathMoves, onSelect, activePath, activeNodeRef, onMoveMenu }) {
  const myPath = [...pathMoves, node.name];
  const singleChild = node.children.length === 1 ? node.children[0] : null;
  const multiChildren = node.children.length > 1 ? node.children : [];
  const childPath = singleChild ? [...myPath, singleChild.name] : null;

  const isExact = activePath.length === myPath.length && activePath.join(',') === myPath.join(',');
  const isAncestor = activePath.length > myPath.length &&
    activePath.slice(0, myPath.length).join(',') === myPath.join(',');
  const childIsExact = childPath && activePath.length === childPath.length &&
    activePath.join(',') === childPath.join(',');

  const grandchildren = singleChild ? singleChild.children : [];
  const branchChildren = multiChildren.length > 0 ? multiChildren : grandchildren;
  const branchDepth = multiChildren.length > 0 ? depth + 1 : depth + 2;
  const branchBase = multiChildren.length > 0 ? myPath : childPath;
  const hasBranches = branchChildren.length > 0;

  // Auto-expand when active path passes through this node
  const [collapsed, setCollapsed] = useState(!(isExact || isAncestor));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isExact || isAncestor) setCollapsed(false);
  }, [activePath.join(',')]);

  return (
    <div className="tree-line">
      <div className="tree-run">
        {hasBranches && (
          <button
            type="button"
            className="tree-toggle"
            onClick={() => setCollapsed(c => !c)}
            aria-label={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? '+' : '−'}
          </button>
        )}
        <span
          ref={isExact ? activeNodeRef : undefined}
          className={`tree-move${isPathActive(activePath, myPath) ? ' tree-move-active' : ''}`}
          onClick={() => onSelect(myPath)}
          onContextMenu={e => onMoveMenu(e, myPath)}
          title={node.opening_name || undefined}
        >
          {moveLabel(depth, node.name)}
        </span>
        {singleChild && (
          <span
            ref={childIsExact ? activeNodeRef : undefined}
            className={`tree-move${isPathActive(activePath, childPath) ? ' tree-move-active' : ''}`}
            onClick={() => onSelect(childPath)}
            onContextMenu={e => onMoveMenu(e, childPath)}
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
              activeNodeRef={activeNodeRef}
              onMoveMenu={onMoveMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function BlackRepertoire() {
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

  // Opening explorer state
  const [explorerTab,     setExplorerTab]     = useState('masters');
  const [explorerMasters, setExplorerMasters] = useState(null);
  const [explorerLichess, setExplorerLichess] = useState(null);
  const [explorerLoading, setExplorerLoading] = useState(false);

  // Coach state
  const [coachDismissed, setCoachDismissed] = useState(false);

  // Live tree scroll ref — scrolls to the active move when allMoves changes
  const activeNodeRef = useRef(null);

  // Context menu state for right-clicking tree moves
  const [contextMenu, setContextMenu] = useState(null);
  // { x, y, path: string[], matchingLines: Line[] }

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
    setExplorerMasters(null);
    setExplorerLichess(null);
    setExplorerTab('masters');
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

  // Arrow-key navigation (skip when an input/textarea is focused)
  const stepBackRef = useRef(stepBack);
  const stepForwardRef = useRef(stepForward);
  useEffect(() => { stepBackRef.current = stepBack; });
  useEffect(() => { stepForwardRef.current = stepForward; });
  useEffect(() => {
    function handleKeyDown(e) {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft')  stepBackRef.current();
      if (e.key === 'ArrowRight') stepForwardRef.current();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-scroll tree to active move when board position changes
  useEffect(() => {
    if (activeNodeRef.current) {
      activeNodeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMoves.join(',')]);

  // Context menu: open on right-click of a tree move
  function openContextMenu(e, path) {
    e.preventDefault();
    e.stopPropagation();
    const matchingLines = lines.filter(line => {
      const tokens = (line.moves || '').split(/\s+/).filter(Boolean);
      return path.length <= tokens.length &&
        path.join(',') === tokens.slice(0, path.length).join(',');
    });
    setContextMenu({ x: e.clientX, y: e.clientY, path, matchingLines });
  }

  // Close context menu on any outside click
  useEffect(() => {
    if (!contextMenu) return;
    function close() { setContextMenu(null); }
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
    };
  }, [contextMenu]);

  // ── Data fetching ──────────────────────────────────────────────────────────

  async function fetchLines() {
    try {
      const res = await api.get('/openings/black/');
      setLines(res.data);
    } catch {
      setError('Failed to load openings.');
    }
  }

  async function fetchTree() {
    try {
      const res = await api.get('/openings/black/tree');
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

  // Explorer: fetch Masters data + eco autofill whenever position changes (debounced 500ms)
  useEffect(() => {
    if (stepIndex === 0) { setExplorerMasters(null); setExplorerLichess(null); return; }
    setExplorerLoading(true);
    setExplorerLichess(null);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/openings/explorer', {
          params: { fen: boardGame.fen(), source: 'masters' },
        });
        const data = res.data ?? null;
        setExplorerMasters(data);
        if (data?.opening) {
          setForm(f => ({
            ...f,
            eco_code:     f.eco_code     || data.opening.eco  || '',
            opening_name: f.opening_name || data.opening.name || '',
          }));
        }
      } catch { setExplorerMasters(null); }
      finally  { setExplorerLoading(false); }
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardGame]);

  // Explorer: fetch Lichess DB data on-demand when that tab is selected
  useEffect(() => {
    if (explorerTab !== 'lichess' || stepIndex === 0 || explorerLichess !== null) return;
    let cancelled = false;
    setExplorerLoading(true);
    (async () => {
      try {
        const res = await api.get('/openings/explorer', {
          params: { fen: boardGame.fen(), source: 'lichess' },
        });
        if (!cancelled) setExplorerLichess(res.data ?? null);
      } catch { if (!cancelled) setExplorerLichess(null); }
      finally  { if (!cancelled) setExplorerLoading(false); }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explorerTab, boardGame]);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleAdd(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/openings/black/', { ...form });
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
      await api.delete(`/openings/black/${id}`);
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

  // ── Live opening tree (rendered inline with board) ────────────────────────

  function renderLiveTree() {
    const displayTree = (tree && tree.children.length > 0) ? tree : buildTreeFromLines(lines);
    const isEmpty = displayTree.children.length === 0;

    return (
      <div className="live-tree-col">
        <div className="live-tree-header">
          <span className="engine-title">Opening Tree</span>
          <span className="rep-section-count muted">
            {lines.length} line{lines.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="live-tree-scroll">
          {isEmpty ? (
            <p className="engine-empty muted">No lines saved yet — add your first line above</p>
          ) : (
            displayTree.children.map(child => (
              <TreeNode
                key={child.id}
                node={child}
                depth={0}
                pathMoves={[]}
                onSelect={loadPosition}
                activePath={allMoves}
                activeNodeRef={activeNodeRef}
                onMoveMenu={openContextMenu}
              />
            ))
          )}
        </div>
      </div>
    );
  }

  function renderContextMenu() {
    if (!contextMenu) return null;
    const { x, y, path, matchingLines } = contextMenu;
    const label = moveLabel(path.length - 1, path[path.length - 1]);
    return (
      <div
        className="tree-ctx-menu"
        style={{ top: y, left: x }}
        onClick={e => e.stopPropagation()}
      >
        <div className="tree-ctx-header">{label}</div>
        <button
          className="tree-ctx-item"
          onClick={() => { loadPosition(path); setContextMenu(null); }}
        >
          Load position
        </button>
        {matchingLines.length > 0 && (
          <div className="tree-ctx-divider" />
        )}
        {matchingLines.map(line => (
          <button
            key={line.id}
            className="tree-ctx-item tree-ctx-delete"
            onClick={() => { handleDelete(line.id); setContextMenu(null); }}
          >
            Delete — {line.opening_name || <code>{line.moves}</code>}
          </button>
        ))}
        {matchingLines.length === 0 && (
          <p className="tree-ctx-empty">No saved lines at this move</p>
        )}
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="page">
      <div className="page-header">
        <h1>Black Repertoire ♚</h1>
        <p>Build your opening tree — play moves on the board, then save the line</p>
      </div>

      <form className="card add-form" onSubmit={handleAdd}>
        <div className="card-label">
          Add Black ♚ Opening Line
        </div>

        {!coachDismissed && stepIndex === 0 && (
          <CoachBanner onDismiss={() => setCoachDismissed(true)}>
            Choose a white move to build responses against — I recommend starting with <strong>e4</strong> or <strong>d4</strong>, as those are the two most commonly played first moves!
          </CoachBanner>
        )}
        {!coachDismissed && stepIndex === 1 && (
          <CoachBanner onDismiss={() => setCoachDismissed(true)}>
            Nice! Now choose your response to build your repertoire around. The most common black replies are highlighted in the Opening Book →
          </CoachBanner>
        )}

        <div className="rep-board-engine-row">
          <div className="rep-input-board">
            <Chessboard
              position={boardGame.fen()}
              onPieceDrop={onPieceDrop}
              boardWidth={720}
              boardOrientation="black"
              customPieces={woodenPieces}
              customBoardStyle={{ backgroundImage: 'url(/wood4.jpg)', backgroundSize: '100% 100%' }}
              customDarkSquareStyle={{}}
              customLightSquareStyle={{}}
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

            {stepIndex > 0 && (
              <div className="book-panel">
                <div className="book-header">
                  <span className="book-title">Opening Book</span>
                  {explorerLoading && <span className="engine-loading">…</span>}
                </div>

                <div className="book-tabs" role="tablist">
                  {['masters', 'lichess'].map(tab => (
                    <button key={tab} type="button" role="tab" aria-selected={explorerTab === tab}
                      className={`book-tab${explorerTab === tab ? ' book-tab-active' : ''}`}
                      onClick={() => setExplorerTab(tab)}>
                      {tab === 'masters' ? 'Masters' : 'Lichess DB'}
                    </button>
                  ))}
                </div>

                {(() => {
                  const data  = explorerTab === 'masters' ? explorerMasters : explorerLichess;
                  const moves = data?.moves ?? [];
                  if (!explorerLoading && moves.length === 0) {
                    return <p className="engine-empty muted">No data for this position</p>;
                  }
                  const coachHighlight = stepIndex === 1 && !coachDismissed;
                  return (
                    <ul className="book-moves">
                      {moves.map((m, i) => {
                        const { w, d, l, total } = wdlPercents(m.white, m.draws, m.black);
                        return (
                          <li key={i} className={`book-move-row${coachHighlight && i < 3 ? ' coach-highlight' : ''}`}>
                            <span className="book-move-san">{m.san}</span>
                            <div className="book-wdl-wrap">
                              <div className="book-wdl-bar">
                                <div className="book-wdl-w" style={{ width: `${w}%` }} />
                                <div className="book-wdl-d" style={{ width: `${d}%` }} />
                                <div className="book-wdl-l" style={{ width: `${l}%` }} />
                              </div>
                              <div className="book-wdl-tooltip">
                                <span className="wdl-tip-w">W {w.toFixed(0)}%</span>
                                <span className="wdl-tip-d">D {d.toFixed(0)}%</span>
                                <span className="wdl-tip-l">L {l.toFixed(0)}%</span>
                              </div>
                            </div>
                            <span className="book-game-count muted">{formatGameCount(total)}</span>
                            <button type="button" className="btn btn-ghost btn-play"
                              onClick={() => playEngineMove(m.uci)}>▶ Play</button>
                          </li>
                        );
                      })}
                    </ul>
                  );
                })()}
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

          {renderLiveTree()}
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
      {renderContextMenu()}
    </main>
  );
}
