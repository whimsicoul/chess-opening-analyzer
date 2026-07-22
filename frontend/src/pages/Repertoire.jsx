import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { woodenPieces } from '../utils/woodenPieces.jsx';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { useEngine } from '../hooks/useEngine';
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

// Convert a UCI move sequence to an array of formatted tokens (e.g. "4.O-O", "g6", "5.d4")
function buildContinuation(fen, uciMoves, maxMoves = 10) {
  try {
    const game = new Chess(fen);
    const tokens = [];
    let moveNum = parseInt(fen.split(' ')[5]) || 1;
    let isWhite = fen.split(' ')[1] === 'w';
    for (let i = 0; i < Math.min(uciMoves.length, maxMoves); i++) {
      const uci = uciMoves[i];
      const moveObj = { from: uci.slice(0, 2), to: uci.slice(2, 4) };
      if (uci.length === 5) moveObj.promotion = uci[4];
      const move = game.move(moveObj);
      if (!move) break;
      if (isWhite) {
        tokens.push(`${moveNum}.${move.san}`);
      } else {
        tokens.push(i === 0 ? `${moveNum}...${move.san}` : move.san);
        moveNum++;
      }
      isWhite = !isWhite;
    }
    return tokens;
  } catch {
    return [];
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

// Strip check/checkmate annotations so tree nodes and stored lines compare equal
function normSan(san) { return san.replace(/[+#]$/, ''); }

// Recursive compact tree node — ChessTempo pairing style:
// Each row shows this move + its single child inline; branches nest below.
function TreeNode({ node, depth, pathMoves, onSelect, activePath, activeNodeRef, onMoveMenu, collapsedPaths }) {
  const myPath = [...pathMoves, node.name];
  const myKey  = myPath.join(',');
  const singleChild = node.children.length === 1 ? node.children[0] : null;
  const multiChildren = node.children.length > 1 ? node.children : [];
  const childPath = singleChild ? [...myPath, singleChild.name] : null;

  const isExact = activePath.length === myPath.length && activePath.join(',') === myKey;
  const isAncestor = activePath.length > myPath.length &&
    activePath.slice(0, myPath.length).join(',') === myKey;
  const childIsExact = childPath && activePath.length === childPath.length &&
    activePath.join(',') === childPath.join(',');

  // What to render below this row
  const grandchildren = singleChild ? singleChild.children : [];
  const branchChildren = multiChildren.length > 0 ? multiChildren : grandchildren;
  const branchDepth = multiChildren.length > 0 ? depth + 1 : depth + 2;
  const branchBase = multiChildren.length > 0 ? myPath : childPath;
  const hasBranches = branchChildren.length > 0;

  const isForceCollapsed = collapsedPaths?.has(myKey) ?? false;

  // Collapsed by default; user can expand branches manually (or navigation into them expands automatically)
  const [collapsed, setCollapsed] = useState(!isExact);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isExact || isAncestor) setCollapsed(false);
    else if (isForceCollapsed) setCollapsed(true);
  }, [activePath.join(','), isForceCollapsed]);

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
          onContextMenu={e => onMoveMenu(e, myPath, hasBranches, collapsed)}
          title={node.opening_name || undefined}
        >
          {moveLabel(depth, node.name)}
        </span>
        {singleChild && (
          <span
            ref={childIsExact ? activeNodeRef : undefined}
            className={`tree-move${isPathActive(activePath, childPath) ? ' tree-move-active' : ''}`}
            onClick={() => onSelect(childPath)}
            onContextMenu={e => onMoveMenu(e, childPath, singleChild.children.length > 0, false)}
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
              collapsedPaths={collapsedPaths}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Repertoire() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const requireAuth = useCallback(() => {
    navigate('/login', { state: { from: location } });
  }, [navigate, location]);

  const [color, setColor]   = useState('white'); // 'white' | 'black'
  const [lines, setLines]   = useState([]);
  const [tree,  setTree]    = useState(null);
  const [error, setError]   = useState(null);
  const [form, setForm] = useState({ moves: '', opening_name: '', eco_code: '' });
  const [repertoireStatus, setRepertoireStatus] = useState(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Auto-save state
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'saved' | 'error'

  // Interactive input board state
  const [boardGame, setBoardGame] = useState(() => new Chess());
  const [allMoves,  setAllMoves]  = useState([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [inputText, setInputText] = useState('');

  // Engine state
  const [engineMode, setEngineMode] = useState(false);
  const [engineDepth, setEngineDepth] = useState(18);
  const [engineLines, setEngineLines] = useState(3);
  const { evalData, evalLoading, evalSource, evalDepth } = useEngine(boardGame, { engineMode, depth: engineDepth, lines: engineLines });
  const [engineHoverFen, setEngineHoverFen] = useState(null);
  const [engineHoverPos, setEngineHoverPos] = useState(null);

  // Opening explorer state
  const [explorerTab,     setExplorerTab]     = useState('masters');
  const [explorerMasters, setExplorerMasters] = useState(null);
  const [explorerLichess, setExplorerLichess] = useState(null);
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [explorerError,   setExplorerError]   = useState(null);

  // Live tree scroll ref — scrolls to the active move when allMoves changes
  const activeNodeRef = useRef(null);
  const boardPanelRef = useRef(null);
  const [dynamicBoardWidth, setDynamicBoardWidth] = useState(860);

  useEffect(() => {
    const el = boardPanelRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width: w, height: h } = entries[0].contentRect;
      if (w > 0 && h > 0) setDynamicBoardWidth(Math.floor(Math.min(w, h)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Context menu state for right-clicking tree moves
  const [contextMenu, setContextMenu] = useState(null);
  // { x, y, path, matchingLines, hasBranches, isCollapsed }

  // Paths that have been manually collapsed via context menu
  const [collapsedPaths, setCollapsedPaths] = useState(new Set());

  // ── Endpoint helpers (color-scoped) ─────────────────────────────────────────
  const base = color === 'black' ? '/openings/black/' : '/openings/';
  const treeEndpoint = color === 'black' ? '/openings/black/tree' : '/openings/tree';
  const statusEndpoint = color === 'black' ? '/openings/black/status' : '/openings/status';
  const rebuildEndpoint = color === 'black' ? '/openings/black/rebuild' : '/openings/rebuild';

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
    setExplorerTab('masters');
    setSaveStatus(null);
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
  function openContextMenu(e, path, hasBranches = false, isCollapsed = false) {
    e.preventDefault();
    e.stopPropagation();
    const matchingLines = lines.filter(line => {
      const tokens = (line.moves || '').split(/\s+/).filter(Boolean);
      return path.length <= tokens.length &&
        path.map(normSan).join(',') === tokens.slice(0, path.length).map(normSan).join(',');
    });
    const flipUp = e.clientY + 260 > window.innerHeight;
    setContextMenu({ x: e.clientX, y: e.clientY, flipUp, path, matchingLines, hasBranches, isCollapsed });
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
      const res = await api.get(base);
      setLines(res.data);
    } catch (err) {
      console.error('[fetchLines] failed:', err?.response?.status, err?.message);
      setError('Failed to load openings.');
    }
  }

  async function fetchTree() {
    try {
      const res = await api.get(treeEndpoint);
      setTree(res.data);
    } catch (err) {
      console.error('[fetchTree] failed:', err?.response?.status, err?.message);
      setTree(null);
    }
  }

  async function fetchRepertoireStatus() {
    try {
      const res = await api.get(statusEndpoint);
      setRepertoireStatus(res.data);
    } catch (err) {
      console.error('[fetchRepertoireStatus] failed:', err?.response?.status, err?.message);
    }
  }

  async function handleRebuild() {
    if (!isAuthenticated) { requireAuth(); return; }
    setRebuilding(true);
    try {
      await api.post(rebuildEndpoint);
      await Promise.all([fetchLines(), fetchTree(), fetchRepertoireStatus()]);
    } catch (err) {
      console.error('[handleRebuild] failed:', err?.response?.status, err?.message);
    } finally {
      setRebuilding(false);
    }
  }

  // Switch between White/Black: reset the board and reload data for the new color
  function handleColorChange(next) {
    if (next === color) return;
    setColor(next);
    resetBoard();
    setTree(null);
    setLines([]);
    setRepertoireStatus(null);
    setCollapsedPaths(new Set());
  }

  useEffect(() => {
    fetchLines();
    fetchTree();
    fetchRepertoireStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color]);


  // Explorer: fetch Masters data + eco autofill whenever position changes (debounced 500ms)
  useEffect(() => {
    setExplorerLoading(true);
    setExplorerMasters(null);
    setExplorerLichess(null);
    setExplorerError(null);
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
      } catch (e) {
        setExplorerMasters(null);
        setExplorerError(e?.message ?? 'Opening book unavailable');
        console.warn('[explorer] masters fetch failed:', e);
      }
      finally  { setExplorerLoading(false); }
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardGame]);

  // Explorer: fetch Lichess DB data on-demand when that tab is selected
  useEffect(() => {
    if (explorerTab !== 'lichess' || explorerLichess !== null) return;
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

  // Auto-save: debounced 1.5s after any move (guests can play freely, but
  // nothing is persisted — never fire the network call for them)
  useEffect(() => {
    if (allMoves.length === 0) return;
    if (!isAuthenticated) return;
    setSaveStatus('saving');
    const timer = setTimeout(async () => {
      try {
        await api.post(base, {
          moves: allMoves.join(' '),
          opening_name: form.opening_name || '',
          eco_code: form.eco_code || '',
          color,
        });
        await fetchLines();
        await fetchTree();
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      }
    }, 1500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMoves.join(',')]);

  // Clear 'saved' indicator after 3s
  useEffect(() => {
    if (saveStatus !== 'saved') return;
    const timer = setTimeout(() => setSaveStatus(null), 3000);
    return () => clearTimeout(timer);
  }, [saveStatus]);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleDeleteFromMove(path) {
    if (!isAuthenticated) { requireAuth(); return; }
    const matchingLines = lines.filter(line => {
      const tokens = (line.moves || '').split(/\s+/).filter(Boolean);
      return path.length <= tokens.length &&
        path.map(normSan).join(',') === tokens.slice(0, path.length).map(normSan).join(',');
    });
    const truncatedMoves = path.slice(0, path.length - 1).join(' ');
    try {
      for (const line of matchingLines) {
        await api.delete(`${base}${line.id}`);
        if (truncatedMoves.length > 0) {
          await api.post(base, {
            moves: truncatedMoves,
            opening_name: line.opening_name || '',
            eco_code: line.eco_code || '',
            color,
          });
        }
      }
      await fetchLines();
      await fetchTree();
    } catch {
      setError('Failed to delete from move.');
    }
  }

  function handleCopyLine(path) {
    const pgn = path.map((move, i) =>
      i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ${move}` : move
    ).join(' ');
    navigator.clipboard.writeText(pgn).catch(() => {});
  }

  function handleCollapseBranch(path) {
    const key = path.join(',');
    setCollapsedPaths(prev => new Set([...prev, key]));
  }

  function handleExpandBranch(path) {
    const key = path.join(',');
    setCollapsedPaths(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  // ── Clear repertoire (both colors) ──────────────────────────────────────────

  async function handleClearRepertoire() {
    if (!isAuthenticated) { requireAuth(); return; }
    if (!window.confirm('Clear your entire repertoire — both White and Black lines? This cannot be undone.')) return;
    setClearing(true);
    try {
      await Promise.all([api.delete('/openings/'), api.delete('/openings/black/')]);
      await Promise.all([fetchLines(), fetchTree(), fetchRepertoireStatus()]);
      resetBoard();
    } catch (err) {
      console.error('[handleClearRepertoire] failed:', err?.response?.status, err?.message);
      setError('Failed to clear repertoire.');
    } finally {
      setClearing(false);
    }
  }

  // ── Derived engine display data ────────────────────────────────────────────

  const engineMoves = (evalData?.pvs ?? [])
    .map(pv => {
      const uciList = (pv.moves ?? '').split(' ').filter(Boolean);
      const firstUci = uciList[0] ?? '';
      const eval_ = formatEval(pv.cp, pv.mate ?? null);
      const continuation = buildContinuation(evalData.fen ?? boardGame.fen(), uciList, 10);
      const previewFens = [];
      try {
        const preview = new Chess(evalData.fen ?? boardGame.fen());
        for (const uci of uciList) {
          if (!preview.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' })) break;
          previewFens.push(preview.fen());
        }
      } catch {}
      return { uci: firstUci, eval: eval_, continuation, previewFens };
    })
    .filter(m => m.continuation.length > 0)
    .slice(0, engineLines);

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
        <div className="rep-color-toggle">
          {['white', 'black'].map(c => (
            <button
              key={c}
              type="button"
              className={`toggle-btn${color === c ? ' active' : ''}`}
              onClick={() => handleColorChange(c)}
            >
              {c === 'white' ? '♔ White' : '♚ Black'}
            </button>
          ))}
        </div>

        <div className="live-tree-header">
          <span className="engine-title">Opening Tree</span>
          <span className="rep-section-count muted">
            {lines.length} line{lines.length !== 1 ? 's' : ''}
          </span>
          {!isEmpty && (
            <button type="button" className="btn btn-ghost btn-clear-rep" onClick={handleClearRepertoire} disabled={clearing}>
              {clearing ? 'Clearing…' : 'Clear Repertoire'}
            </button>
          )}
        </div>

        {isAuthenticated && saveStatus && (
          <div className={`save-status save-status-${saveStatus}`}>
            {saveStatus === 'saving' && 'Saving…'}
            {saveStatus === 'saved'  && 'Saved ✓'}
            {saveStatus === 'error'  && 'Save error'}
          </div>
        )}
        {!isAuthenticated && allMoves.length > 0 && (
          <div className="save-status">
            <button type="button" className="save-status-signin-link" onClick={requireAuth}>
              Sign in to save this line
            </button>
          </div>
        )}

        <div className="live-tree-scroll">
          {isEmpty ? (
            <p className="engine-empty muted">
              {isAuthenticated
                ? 'No lines saved yet — play some moves above'
                : 'Play some moves above to explore — sign in to save your repertoire'}
            </p>
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
                collapsedPaths={collapsedPaths}
              />
            ))
          )}
        </div>
      </div>
    );
  }

  function renderContextMenu() {
    if (!contextMenu) return null;
    const { x, y, flipUp, path, hasBranches } = contextMenu;
    const matchingLines = lines.filter(line => {
      const tokens = (line.moves || '').split(/\s+/).filter(Boolean);
      return path.length <= tokens.length &&
        path.map(normSan).join(',') === tokens.slice(0, path.length).map(normSan).join(',');
    });
    const label = moveLabel(path.length - 1, path[path.length - 1]);
    const isForcedCollapsed = collapsedPaths.has(path.join(','));
    const posStyle = flipUp
      ? { bottom: window.innerHeight - y, top: 'auto', left: x }
      : { top: y, left: x };
    return (
      <div
        className="tree-ctx-menu"
        style={posStyle}
        onClick={e => e.stopPropagation()}
      >
        <div className="tree-ctx-header">{label}</div>

        <button
          className="tree-ctx-item"
          onClick={() => { handleCopyLine(path); setContextMenu(null); }}
        >
          Copy line
        </button>

        {hasBranches && (
          isForcedCollapsed ? (
            <button
              className="tree-ctx-item tree-ctx-muted"
              onClick={() => { handleExpandBranch(path); setContextMenu(null); }}
            >
              Expand children
            </button>
          ) : (
            <button
              className="tree-ctx-item tree-ctx-muted"
              onClick={() => { handleCollapseBranch(path); setContextMenu(null); }}
            >
              Collapse children
            </button>
          )
        )}

        {matchingLines.length > 0 && (
          <>
            <div className="tree-ctx-divider" />
            <button
              className="tree-ctx-item tree-ctx-delete"
              onClick={() => { handleDeleteFromMove(path); setContextMenu(null); }}
            >
              Delete — {label}
            </button>
          </>
        )}

        {matchingLines.length === 0 && (
          <p className="tree-ctx-empty">No saved lines at this move</p>
        )}
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="page rep-page">
      <div className="page-header rep-page-header">
        <div className="rep-page-header-text">
          <h1>Repertoire {color === 'white' ? '♔' : '♚'}</h1>
          <p>Play moves on the board — your lines are saved automatically as you build</p>
        </div>

        {repertoireStatus?.built_at && (
          <div className="rep-status-banner">
            <span>
              Auto-built from {repertoireStatus.games_count ?? 0} game
              {repertoireStatus.games_count === 1 ? '' : 's'}
              {' '}(last updated {new Date(repertoireStatus.built_at).toLocaleString()}).
            </span>
            <button className="rep-rebuild-btn" onClick={handleRebuild} disabled={rebuilding}>
              {rebuilding ? 'Rebuilding…' : 'Rebuild from Games'}
            </button>
          </div>
        )}
      </div>

        <PanelGroup direction="horizontal" className="rep-panel-group">
          <Panel defaultSize={17} minSize={8}>
            {renderLiveTree()}
          </Panel>
          <PanelResizeHandle className="rep-resize-handle" />
          <Panel defaultSize={42} minSize={25}>
            <div ref={boardPanelRef} className="rep-board-panel">
              <Chessboard
                position={boardGame.fen()}
                onPieceDrop={onPieceDrop}
                boardWidth={dynamicBoardWidth}
                boardOrientation={color}
                customPieces={woodenPieces}
                customBoardStyle={{ backgroundImage: 'url(/wood4.jpg)', backgroundSize: '100% 100%' }}
                customDarkSquareStyle={{}}
                customLightSquareStyle={{}}
              />
            </div>
          </Panel>
          <PanelResizeHandle className="rep-resize-handle" />
          <Panel defaultSize={41} minSize={15}>
            <div className="rep-right-col">
            <div className="engine-panel">
                <div className="engine-header">
                  <span className="engine-title">
                    {evalSource === 'stockfish' ? 'Stockfish' : 'Cloud Eval'}
                  </span>
                  <button
                    className={`engine-mode-btn${engineMode ? ' active' : ''}`}
                    onClick={() => setEngineMode(v => !v)}
                    title={engineMode ? 'Switch to Cloud Eval' : 'Switch to Stockfish'}
                  >
                    Engine
                  </button>
                  {topEval && (
                    <span className={`eval-score${evalPositive ? ' eval-pos' : ' eval-neg'}`}>
                      {topEval}
                    </span>
                  )}
                  {evalSource === 'stockfish' && evalDepth != null && (
                    <span className="engine-depth muted">
                      depth {evalDepth}{evalLoading ? `/${engineDepth}` : ''}
                    </span>
                  )}
                </div>

                {(engineMode || evalSource === 'stockfish') && (
                  <div className="engine-controls">
                    <label>Depth
                      <select value={engineDepth} onChange={e => setEngineDepth(Number(e.target.value))}>
                        {[8, 12, 15, 18, 20, 24, 30].map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </label>
                    <label>Lines
                      <select value={engineLines} onChange={e => setEngineLines(Number(e.target.value))}>
                        {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                  </div>
                )}

                {engineMoves.length > 0 && (
                  <ul className="engine-moves engine-moves--live">
                    {engineMoves.map((m, i) => (
                      <li key={i} className="engine-move-row" onClick={() => playEngineMove(m.uci)}
                        onMouseLeave={() => { setEngineHoverFen(null); setEngineHoverPos(null); }}
                      >
                        <span className={`engine-line-eval${m.eval?.startsWith('-') ? ' eval-neg' : ' eval-pos'}`}>
                          {m.eval}
                        </span>
                        <span className="engine-continuation">
                          {m.continuation.map((token, j) => (
                            <span key={j}
                              className={j === 0 ? 'engine-move-first' : 'engine-move-rest'}
                              onMouseEnter={e => {
                                const fen = m.previewFens[j];
                                if (!fen) return;
                                const rect = e.currentTarget.getBoundingClientRect();
                                const popupSize = 220;
                                const top = Math.min(rect.top, window.innerHeight - popupSize - 16);
                                setEngineHoverFen(fen);
                                setEngineHoverPos({ top: Math.max(8, top), right: window.innerWidth - rect.left + 8 });
                              }}
                            >
                              {token}{j < m.continuation.length - 1 ? ' ' : ''}
                            </span>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {!evalLoading && engineMoves.length === 0 && (
                  <p className="engine-empty muted">Position not in cloud database</p>
                )}
              </div>

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
                  return (
                    <ul className="book-moves">
                      {moves.map((m, i) => {
                        const { w, d, l, total } = wdlPercents(m.white, m.draws, m.black);
                        return (
                          <li key={i} className="book-move-row"
                            onClick={() => playEngineMove(m.uci)} style={{ cursor: 'pointer' }}>
                            <span className="book-move-san">{m.san}</span>
                            <div className="book-wdl-wrap">
                              <div className="book-wdl-bar">
                                <div className="book-wdl-w" style={{ width: `${w}%` }}>
                                  {w >= 9 && <span className="book-wdl-label">{w.toFixed(0)}%</span>}
                                </div>
                                <div className="book-wdl-d" style={{ width: `${d}%` }}>
                                  {d >= 9 && <span className="book-wdl-label">{d.toFixed(0)}%</span>}
                                </div>
                                <div className="book-wdl-l" style={{ width: `${l}%` }}>
                                  {l >= 9 && <span className="book-wdl-label">{l.toFixed(0)}%</span>}
                                </div>
                              </div>
                            </div>
                            <span className="book-game-count muted">{formatGameCount(total)}</span>
                          </li>
                        );
                      })}
                    </ul>
                  );
                })()}
              </div>

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

            </div>{/* rep-right-col */}
          </Panel>
        </PanelGroup>

      {error && <p className="msg-error">{error}</p>}
      {renderContextMenu()}

      {engineHoverFen && engineHoverPos && (
        <div className="engine-hover-board" style={{ top: engineHoverPos.top, right: engineHoverPos.right }}>
          <Chessboard
            position={engineHoverFen}
            arePiecesDraggable={false}
            boardWidth={220}
            boardOrientation={color}
            customPieces={woodenPieces}
            customBoardStyle={{ backgroundImage: 'url(/wood4.jpg)', backgroundSize: '100% 100%' }}
            customDarkSquareStyle={{}}
            customLightSquareStyle={{}}
            animationDuration={0}
          />
        </div>
      )}
    </main>
  );
}
