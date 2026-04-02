import { useState, useEffect, useRef } from 'react';
import api from '../api';

// Parse a UCI "info" line into a PV object matching Lichess cloud eval format:
// { multipv, cp?, mate?, moves, depth }
function parseInfoLine(line) {
  const multipvMatch = line.match(/\bmultipv (\d+)\b/);
  const depthMatch   = line.match(/\bdepth (\d+)\b/);
  const cpMatch      = line.match(/\bscore cp (-?\d+)\b/);
  const mateMatch    = line.match(/\bscore mate (-?\d+)\b/);
  const pvMatch      = line.match(/\bpv (.+)$/);
  if (!multipvMatch || !pvMatch) return null;
  const pv = {
    multipv: parseInt(multipvMatch[1]),
    depth: depthMatch ? parseInt(depthMatch[1]) : null,
    moves: pvMatch[1].trim()
  };
  if (mateMatch)     pv.mate = parseInt(mateMatch[1]);
  else if (cpMatch)  pv.cp   = parseInt(cpMatch[1]);
  return pv;
}

// Shared hook: tries Lichess cloud eval first; falls back to local Stockfish WASM.
// Returns { evalData, evalLoading, evalSource, evalDepth }
// evalData shape: { pvs: [{ cp?, mate?, moves, depth }], fen }  (same as cloud eval)
// evalSource: "cloud" | "stockfish" | null
// evalDepth: current depth being analyzed (null for cloud eval, number for stockfish)
// Options:
//   engineMode — when true, skip cloud eval and go straight to Stockfish
//   depth      — Stockfish search depth (default 18)
//   lines      — number of PV lines to compute/display (default 3)
export function useEngine(boardGame, { engineMode = false, depth = 18, lines = 3 } = {}) {
  const [evalData,   setEvalData]   = useState(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalSource, setEvalSource] = useState(null);
  const [evalDepth, setEvalDepth] = useState(null);

  const workerRef          = useRef(null);
  const workerReadyRef     = useRef(false);
  const pendingFenRef      = useRef(null);
  const pvResultsRef       = useRef({
    currentDepth: null,
    currentBatch: {},
    committed: {}
  });
  const activeAnalysisFenRef = useRef(null);
  const stoppingRef        = useRef(false);

  // Always-current refs so startAnalysis never uses stale closure values.
  const depthRef = useRef(depth);
  const linesRef = useRef(lines);
  depthRef.current = depth;
  linesRef.current = lines;

  // Send commands to begin UCI analysis for a given FEN.
  // Must only be called when the worker is initialized and ready.
  const startAnalysis = (fen) => {
    const worker = workerRef.current;
    if (!worker) return;
    console.log('[useEngine] startAnalysis called with fen:', fen.substring(0, 30));
    pvResultsRef.current = {
      currentDepth: null,
      currentBatch: {},
      committed: {}
    };
    activeAnalysisFenRef.current = fen;
    const posCmd = `position fen ${fen}`;
    const goCmd = `go depth ${depthRef.current} multipv ${linesRef.current}`;
    console.log('[useEngine] posting commands:', { posCmd: posCmd.substring(0, 50), goCmd });
    worker.postMessage(posCmd);
    worker.postMessage(goCmd);
    console.log('[useEngine] posted position and go commands, depth:', depthRef.current, 'lines:', linesRef.current);
  };

  // Lazily create the Stockfish worker and wire up UCI message handling.
  const initWorker = () => {
    const worker = new Worker('/stockfish-18-lite-single.js');
    workerReadyRef.current = false;

    worker.onmessage = (e) => {
      const line = typeof e.data === 'string' ? e.data : String(e.data ?? '');
      if (!line) return;

      if (line === 'uciok') {
        // UCI initialization complete. Set options before analyzing.
        console.log('[useEngine] uciok received, setting MultiPV option');
        worker.postMessage('setoption name MultiPV value 8');
        worker.postMessage('isready');
        return;
      }

      if (line === 'readyok') {
        workerReadyRef.current = true;
        // If a position was queued while the worker was initializing, run it now.
        if (pendingFenRef.current) {
          const fen = pendingFenRef.current;
          pendingFenRef.current = null;
          startAnalysis(fen);
        }
        return;
      }

      if (line.startsWith('info') && line.includes('score')) {
        // Only collect info lines if we're actively analyzing (not stopping).
        if (!stoppingRef.current) {
          const pv = parseInfoLine(line);
          if (!pv || pv.depth == null) return;

          const state = pvResultsRef.current;

          // Starting a new depth — prepare to emit the previous batch
          if (pv.depth !== state.currentDepth) {
            state.currentDepth = pv.depth;
            state.currentBatch = {};
          }

          // Accumulate this multipv result for the current depth
          state.currentBatch[pv.multipv] = pv;
          console.log('[useEngine] got info line, depth:', pv.depth, 'multipv:', pv.multipv, 'cp:', pv.cp, 'mate:', pv.mate, 'batch size:', Object.keys(state.currentBatch).length);

          // Check if this depth level is complete (all multipv lines arrived)
          const batchSize = Object.keys(state.currentBatch).length;
          if (batchSize >= linesRef.current) {
            // Depth complete — snapshot and emit
            state.committed = { ...state.currentBatch };

            const activeFen = activeAnalysisFenRef.current;
            if (activeFen) {
              const pvs = Object.keys(state.committed)
                .sort((a, b) => Number(a) - Number(b))
                .map(k => state.committed[k]);

              console.log('[useEngine] depth', pv.depth, 'complete, emitting', pvs.length, 'pvs');
              setEvalData({ pvs, fen: activeFen });
              setEvalSource('stockfish');
              setEvalLoading(false);
              setEvalDepth(pv.depth);
            }
          }
        }
        return;
      }

      if (line.startsWith('bestmove')) {
        const committedCount = Object.keys(pvResultsRef.current.committed).length;
        console.log('[useEngine] bestmove received', { stoppingRef: stoppingRef.current, pendingFen: !!pendingFenRef.current, activeFen: !!activeAnalysisFenRef.current, workerReady: workerReadyRef.current, committedPvsCount: committedCount });
        if (stoppingRef.current) {
          // This bestmove is the response to our 'stop' command.
          // Dequeue the next analysis if one is pending.
          console.log('[useEngine] consuming stop-bestmove, pendingFen:', pendingFenRef.current);
          stoppingRef.current = false;
          const fen = pendingFenRef.current;
          pendingFenRef.current = null;
          if (fen && workerReadyRef.current) {
            console.log('[useEngine] starting analysis for pending fen');
            startAnalysis(fen);
          } else {
            console.log('[useEngine] cannot start analysis yet', { fen: !!fen, workerReady: workerReadyRef.current });
          }
          return;
        }

        // Real bestmove — emit final results from committed state.
        const fen = activeAnalysisFenRef.current;
        if (!fen) {
          console.log('[useEngine] bestmove has no active fen, ignoring');
          return;
        }

        const { committed } = pvResultsRef.current;
        const pvs = Object.keys(committed)
          .sort((a, b) => Number(a) - Number(b))
          .map(k => committed[k]);

        console.log('[useEngine] emitting final evalData with', pvs.length, 'pvs');
        if (pvs.length > 0) {
          activeAnalysisFenRef.current = null;
          setEvalData({ pvs, fen });
          setEvalSource('stockfish');
          setEvalLoading(false);
        }
      }
    };

    worker.postMessage('uci');
    workerRef.current = worker;
    return worker;
  };

  // Stop any ongoing analysis and kick off Stockfish for a new FEN.
  const runStockfish = (fen) => {
    console.log('[useEngine] runStockfish called with fen:', fen.substring(0, 30), 'worker exists:', !!workerRef.current);
    if (workerRef.current) {
      pvResultsRef.current = {
        currentDepth: null,
        currentBatch: {},
        committed: {}
      };

      if (stoppingRef.current) {
        // Already waiting for a stop-bestmove — just update the pending FEN.
        console.log('[useEngine] already stopping, updating pending fen');
        pendingFenRef.current = fen;
        activeAnalysisFenRef.current = null;
      } else if (activeAnalysisFenRef.current) {
        // Engine is actively analyzing — stop it and queue the new position.
        console.log('[useEngine] stopping active analysis');
        pendingFenRef.current = fen;
        activeAnalysisFenRef.current = null;
        stoppingRef.current = true;
        workerRef.current.postMessage('stop');
      } else if (workerReadyRef.current) {
        // Engine is idle and ready — start analysis directly.
        console.log('[useEngine] engine idle, starting analysis directly');
        startAnalysis(fen);
      } else {
        // Worker exists but not ready yet — queue it.
        console.log('[useEngine] worker not ready, queuing fen');
        pendingFenRef.current = fen;
      }
    } else {
      // No worker yet — init and queue via pendingFenRef (handled in readyok).
      console.log('[useEngine] initializing new worker');
      stoppingRef.current = false;
      initWorker();
      pendingFenRef.current = fen;
    }
  };

  // Main effect: runs on every position change.
  useEffect(() => {
    setEvalLoading(true);
    setEvalData(null);
    setEvalSource(null);
    setEvalDepth(null);

    const fen = boardGame.fen();
    let cancelled = false;

    const timer = setTimeout(async () => {
      // If the user has selected engine mode, skip cloud eval entirely.
      if (engineMode) {
        if (!cancelled) runStockfish(fen);
        return;
      }

      // 1. Try Lichess cloud eval.
      try {
        const res = await api.get('/openings/cloud-eval', {
          params: { fen, multiPv: lines },
        });
        if (cancelled) return;
        if (res.data) {
          setEvalData({ ...res.data, fen });
          setEvalSource('cloud');
          setEvalLoading(false);
          return;
        }
      } catch {
        if (cancelled) return;
      }

      // 2. Cloud eval unavailable — fall back to local Stockfish WASM.
      if (!cancelled) runStockfish(fen);
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      // Eagerly stop worker if analysis is running, to prevent stale info lines
      // from the previous position from being emitted into the new position.
      if (workerRef.current && activeAnalysisFenRef.current && !stoppingRef.current) {
        console.log('[useEngine] cleanup: stopping active analysis');
        stoppingRef.current = true;
        pendingFenRef.current = null;
        activeAnalysisFenRef.current = null;
        pvResultsRef.current = {
          currentDepth: null,
          currentBatch: {},
          committed: {}
        };
        workerRef.current.postMessage('stop');
      } else {
        activeAnalysisFenRef.current = null;
      }
    };
  // depth and lines are kept current via refs (depthRef, linesRef),
  // so we don't need to re-run the effect when they change.
  }, [boardGame, engineMode]);

  // Terminate worker when the component unmounts.
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current    = null;
        workerReadyRef.current = false;
      }
    };
  }, []);

  return { evalData, evalLoading, evalSource, evalDepth };
}
