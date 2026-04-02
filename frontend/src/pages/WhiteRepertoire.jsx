import { useEffect, useState, useCallback, useRef } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { woodenPieces } from '../utils/woodenPieces.jsx';
import api from '../api';
import RepertoireWizard from '../components/RepertoireWizard.jsx';
import { WHITE_WIZARD_STEPS } from '../components/wizardSteps.js';
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

// Find all positions where the player has multiple moves saved.
// White rep: player moves at even depths (0,2,4…); Black rep: odd depths.
function findConflicts(node, depth, isWhiteRep, path = []) {
  const conflicts = [];
  const isPlayerTurn = isWhiteRep ? (depth % 2 === 0) : (depth % 2 === 1);
  if (isPlayerTurn && node.children && node.children.length > 1) {
    conflicts.push({ path, node, children: node.children });
  }
  if (node.children) {
    for (const child of node.children) {
      conflicts.push(...findConflicts(child, depth + 1, isWhiteRep, [...path, child.name]));
    }
  }
  return conflicts;
}


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

  // Start fully expanded; user can collapse branches manually
  const [collapsed, setCollapsed] = useState(isForceCollapsed);
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

export default function WhiteRepertoire() {
  const [lines, setLines]   = useState([]);
  const [tree,  setTree]    = useState(null);
  const [error, setError]   = useState(null);
  const [form, setForm] = useState({ moves: '', opening_name: '', eco_code: '' });

  // Auto-save & review state
  const [saveStatus,     setSaveStatus]     = useState(null); // null | 'saving' | 'saved' | 'error'
  const [reviewMode,     setReviewMode]     = useState(false);
  const [conflicts,      setConflicts]      = useState([]);
  const [conflictIndex,  setConflictIndex]  = useState(0);
  const [reviewComplete, setReviewComplete] = useState(false);

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

  // Wizard state
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardDismissed, setWizardDismissed] = useState(
    () => localStorage.getItem('wizard_white_seen') === '1'
  );

  function advanceWizard(trigger) {
    if (wizardDismissed) return;
    const step = WHITE_WIZARD_STEPS[wizardStep];
    if (step?.advanceOn === trigger) setWizardStep(s => s + 1);
  }

  // Live tree scroll ref — scrolls to the active move when allMoves changes
  const activeNodeRef = useRef(null);
  const boardPanelRef = useRef(null);
  const wizardAutoPlayedStep = useRef(-1);
  const [dynamicBoardWidth, setDynamicBoardWidth] = useState(860);

  useEffect(() => {
    const el = boardPanelRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width;
      if (w > 0) setDynamicBoardWidth(Math.floor(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Context menu state for right-clicking tree moves
  const [contextMenu, setContextMenu] = useState(null);
  // { x, y, path, matchingLines, hasBranches, isCollapsed }

  // Paths that have been manually collapsed via context menu
  const [collapsedPaths, setCollapsedPaths] = useState(new Set());

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
      if (!wizardDismissed && wizardStep === 0) advanceWizard('first-move');
      else advanceWizard('move-made');
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
    advanceWizard('book-click');
    const next = new Chess(boardGame.fen());
    try {
      const move = next.move({ from: uciMove.slice(0, 2), to: uciMove.slice(2, 4), promotion: uciMove[4] || 'q' });
      if (!move) return;
      setBoardGame(next);
      _applyMoves([...allMoves.slice(0, stepIndex), move.san]);
    } catch { /* ignore invalid */ }
  }

  function playMoveInternal(uciMove) {
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

  // Wizard auto-play: when entering steps 1, 3, or 4, play the most popular
  // book move. Uses a ref to avoid double-firing if explorerMasters re-fetches.
  const AUTO_PLAY_STEPS = [1, 3];
  useEffect(() => {
    if (wizardDismissed) return;
    if (!AUTO_PLAY_STEPS.includes(wizardStep)) return;
    if (wizardAutoPlayedStep.current === wizardStep) return;
    if (!explorerMasters?.moves?.length) return;

    const uci = explorerMasters.moves[0].uci;
    const timer = setTimeout(() => {
      playMoveInternal(uci);
      wizardAutoPlayedStep.current = wizardStep;
    }, 600);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardStep, explorerMasters, wizardDismissed]);

  // Wizard step 5: programmatically open the context menu for the last played move
  useEffect(() => {
    if (wizardStep !== 4 || wizardDismissed) return;
    if (allMoves.length === 0) return;

    const timer = setTimeout(() => {
      const activeEl = document.querySelector('.tree-move-active');
      let x, y;
      if (activeEl) {
        const rect = activeEl.getBoundingClientRect();
        x = rect.right + 8;
        y = rect.top;
      } else {
        x = window.innerWidth * 0.18;
        y = window.innerHeight * 0.4;
      }
      const path = allMoves;
      const matchingLines = lines.filter(line => {
        const tokens = (line.moves || '').split(/\s+/).filter(Boolean);
        return path.length <= tokens.length &&
          path.map(normSan).join(',') === tokens.slice(0, path.length).map(normSan).join(',');
      });
      const flipUp = y + 260 > window.innerHeight;
      setContextMenu({ x, y, flipUp, path, matchingLines, hasBranches: false, isCollapsed: false });
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardStep, allMoves.join(','), wizardDismissed]);

  // Context menu: open on right-click of a tree move
  function openContextMenu(e, path, hasBranches = false, isCollapsed = false) {
    if (!wizardDismissed && wizardStep < WHITE_WIZARD_STEPS.length && wizardStep !== 4) return;
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


  // Explorer: fetch Masters data + eco autofill whenever position changes (debounced 500ms)
  useEffect(() => {
    setExplorerLoading(true);
    setExplorerMasters(null);
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

  // Auto-save: debounced 1.5s after any move; skipped in review mode
  useEffect(() => {
    if (allMoves.length === 0 || reviewMode) return;
    setSaveStatus('saving');
    const timer = setTimeout(async () => {
      try {
        await api.post('/openings/', {
          moves: allMoves.join(' '),
          opening_name: form.opening_name || '',
          eco_code: form.eco_code || '',
          color: 'white',
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
  }, [allMoves.join(','), reviewMode]);

  // Clear 'saved' indicator after 3s
  useEffect(() => {
    if (saveStatus !== 'saved') return;
    const timer = setTimeout(() => setSaveStatus(null), 3000);
    return () => clearTimeout(timer);
  }, [saveStatus]);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleDeleteFromMove(path) {
    const matchingLines = lines.filter(line => {
      const tokens = (line.moves || '').split(/\s+/).filter(Boolean);
      return path.length <= tokens.length &&
        path.map(normSan).join(',') === tokens.slice(0, path.length).map(normSan).join(',');
    });
    const truncatedMoves = path.slice(0, path.length - 1).join(' ');
    try {
      for (const line of matchingLines) {
        await api.delete(`/openings/${line.id}`);
        if (truncatedMoves.length > 0) {
          await api.post('/openings/', {
            moves: truncatedMoves,
            opening_name: line.opening_name || '',
            eco_code: line.eco_code || '',
            color: 'white',
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

  // ── Review mode ────────────────────────────────────────────────────────────

  function enterReviewMode() {
    if (!tree) return;
    const found = findConflicts(tree, 0, true);
    if (found.length === 0) {
      setReviewComplete(true);
      return;
    }
    setConflicts(found);
    setConflictIndex(0);
    setReviewMode(true);
    loadPosition(found[0].path);
  }

  function exitReviewMode() {
    setReviewMode(false);
    setConflicts([]);
    setConflictIndex(0);
    setReviewComplete(false);
  }

  async function handleConflictResolve(keepMove) {
    const conflict = conflicts[conflictIndex];
    const movesToDelete = conflict.children.filter(c => c.name !== keepMove.name);
    try {
      const toDeleteIds = [];
      for (const moveNode of movesToDelete) {
        const deletePath = [...conflict.path, moveNode.name];
        const matching = lines.filter(line => {
          const tokens = (line.moves || '').split(/\s+/).filter(Boolean);
          return deletePath.length <= tokens.length &&
            deletePath.map(normSan).join(',') === tokens.slice(0, deletePath.length).map(normSan).join(',');
        });
        toDeleteIds.push(...matching.map(l => l.id));
      }
      await Promise.all(toDeleteIds.map(id => api.delete(`/openings/${id}`)));
      const res = await api.get('/openings/tree');
      const freshTree = res.data;
      setTree(freshTree);
      await fetchLines();
      const remaining = findConflicts(freshTree, 0, true);
      if (remaining.length === 0) {
        setReviewMode(false);
        setReviewComplete(true);
        setConflicts([]);
        setConflictIndex(0);
      } else {
        setConflicts(remaining);
        setConflictIndex(0);
        loadPosition(remaining[0].path);
      }
    } catch {
      setError('Failed to resolve conflict.');
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
    const currentConflict = reviewMode ? conflicts[conflictIndex] : null;

    return (
      <div className="live-tree-col">
        <div className="live-tree-header">
          <span className="engine-title">Opening Tree</span>
          <span className="rep-section-count muted">
            {lines.length} line{lines.length !== 1 ? 's' : ''}
          </span>
          {!isEmpty && !reviewMode && (
            <button type="button" className="btn btn-ghost btn-review" onClick={enterReviewMode}>
              Review Repertoire
            </button>
          )}
          {reviewMode && (
            <button type="button" className="btn btn-ghost btn-review-stop" onClick={exitReviewMode}>
              Stop Review
            </button>
          )}
        </div>

        {saveStatus && (
          <div className={`save-status save-status-${saveStatus}`}>
            {saveStatus === 'saving' && 'Saving\u2026'}
            {saveStatus === 'saved'  && 'Saved \u2713'}
            {saveStatus === 'error'  && 'Save error'}
          </div>
        )}

        {reviewComplete && !reviewMode && (
          <div className="review-complete-banner">Repertoire looks good! No conflicts found.</div>
        )}

        {reviewMode && currentConflict && (
          <div className="review-panel">
            <div className="review-panel-header">
              Review your repertoire
              <span className="review-conflicts-count">
                {conflicts.length - conflictIndex} conflict{conflicts.length - conflictIndex !== 1 ? 's' : ''} remaining
              </span>
            </div>
            <p className="review-panel-prompt">You have multiple moves from this position. Keep one:</p>
            <div className="review-move-choices">
              {currentConflict.children.map(child => (
                <button key={child.name} type="button" className="btn review-move-btn"
                  onClick={() => handleConflictResolve(child)}>
                  {moveLabel(currentConflict.path.length, child.name)}
                  {child.opening_name && (
                    <span className="review-move-opening">{child.opening_name}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="live-tree-scroll">
          {isEmpty ? (
            <p className="engine-empty muted">No lines saved yet — play some moves above</p>
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
    <main className="page">
      <div className="page-header">
        <h1>White Repertoire ♔</h1>
        <p>Play moves on the board — your lines are saved automatically as you build</p>
      </div>

      <div className="card add-form">
        <div className="card-label">
          White ♔ Repertoire Builder
          <button
            className="rw-summon-btn"
            onClick={() => {
              setWizardStep(0);
              setWizardDismissed(false);
              localStorage.removeItem('wizard_white_seen');
              wizardAutoPlayedStep.current = -1;
              setBoardGame(new Chess());
              setAllMoves([]);
              setStepIndex(0);
            }}
            title="Open wizard"
          >
            ✦ Wizard
          </button>
        </div>

        {form.opening_name && (
          <div className="rep-opening-info">
            <span className="rep-opening-name">{form.opening_name}</span>
            {form.eco_code && <span className="badge-eco">{form.eco_code}</span>}
          </div>
        )}

        {!wizardDismissed && wizardStep < WHITE_WIZARD_STEPS.length && (
          <RepertoireWizard
            steps={WHITE_WIZARD_STEPS}
            stepIndex={wizardStep}
            onAdvance={() => setWizardStep(s => s + 1)}
            onDismiss={() => {
              setWizardDismissed(true);
              localStorage.setItem('wizard_white_seen', '1');
            }}
          />
        )}

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
                boardOrientation="white"
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
                    title={engineMode ? 'Switch to Cloud Eval' : 'Switch to Engine'}
                  >
                    {engineMode ? 'Engine' : 'Auto'}
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
      </div>

      {error && <p className="msg-error">{error}</p>}
      {renderContextMenu()}

      {engineHoverFen && engineHoverPos && (
        <div className="engine-hover-board" style={{ top: engineHoverPos.top, right: engineHoverPos.right }}>
          <Chessboard
            position={engineHoverFen}
            arePiecesDraggable={false}
            boardWidth={220}
            boardOrientation="white"
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
