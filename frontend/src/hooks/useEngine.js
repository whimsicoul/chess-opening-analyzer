import { useState, useEffect, useRef } from 'react';
import api from '../api';

// Parse a UCI "info" line into a PV object matching Lichess cloud eval format:
// { multipv, cp?, mate?, moves }
function parseInfoLine(line) {
  const multipvMatch = line.match(/\bmultipv (\d+)\b/);
  const cpMatch      = line.match(/\bscore cp (-?\d+)\b/);
  const mateMatch    = line.match(/\bscore mate (-?\d+)\b/);
  const pvMatch      = line.match(/\bpv (.+)$/);
  if (!multipvMatch || !pvMatch) return null;
  const pv = { multipv: parseInt(multipvMatch[1]), moves: pvMatch[1].trim() };
  if (mateMatch)     pv.mate = parseInt(mateMatch[1]);
  else if (cpMatch)  pv.cp   = parseInt(cpMatch[1]);
  return pv;
}

// Shared hook: tries Lichess cloud eval first; falls back to local Stockfish WASM.
// Returns { evalData, evalLoading, evalSource }
// evalData shape: { pvs: [{ cp?, mate?, moves }], fen }  (same as cloud eval)
// evalSource: "cloud" | "stockfish" | null
export function useEngine(boardGame) {
  const [evalData,   setEvalData]   = useState(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalSource, setEvalSource] = useState(null);

  const workerRef          = useRef(null);
  const workerReadyRef     = useRef(false);
  const pendingFenRef      = useRef(null);
  const pvResultsRef       = useRef({});
  const activeAnalysisFenRef = useRef(null);

  // Send commands to begin UCI analysis for a given FEN.
  // Must only be called when the worker is initialized and ready.
  const startAnalysis = (fen) => {
    const worker = workerRef.current;
    if (!worker) return;
    pvResultsRef.current = {};
    activeAnalysisFenRef.current = fen;
    worker.postMessage(`position fen ${fen}`);
    worker.postMessage('go depth 18 multipv 5');
  };

  // Lazily create the Stockfish worker and wire up UCI message handling.
  const initWorker = () => {
    const worker = new Worker('/stockfish-18-lite-single.js');
    workerReadyRef.current = false;

    worker.onmessage = (e) => {
      const line = typeof e.data === 'string' ? e.data : String(e.data ?? '');
      if (!line) return;

      if (line === 'uciok') {
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
        const pv = parseInfoLine(line);
        // Keep only the latest result per multipv index (deepest depth wins).
        if (pv) pvResultsRef.current[pv.multipv] = pv;
        return;
      }

      if (line.startsWith('bestmove')) {
        const fen = activeAnalysisFenRef.current;
        activeAnalysisFenRef.current = null;
        if (!fen) return;

        const pvs = Object.keys(pvResultsRef.current)
          .sort((a, b) => Number(a) - Number(b))
          .map(k => pvResultsRef.current[k]);

        if (pvs.length > 0) {
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
    const worker = workerRef.current ?? initWorker();
    worker.postMessage('stop');
    pvResultsRef.current       = {};
    activeAnalysisFenRef.current = null;
    pendingFenRef.current      = null;

    if (workerReadyRef.current) {
      startAnalysis(fen);
    } else {
      // Worker is still initializing; queue the position.
      pendingFenRef.current = fen;
    }
  };

  // Main effect: runs on every position change.
  useEffect(() => {
    setEvalLoading(true);
    setEvalData(null);
    setEvalSource(null);

    // Abort any in-flight Stockfish analysis for the previous position.
    if (workerRef.current) {
      workerRef.current.postMessage('stop');
      activeAnalysisFenRef.current = null;
      pendingFenRef.current        = null;
    }

    const fen = boardGame.fen();
    let cancelled = false;

    const timer = setTimeout(async () => {
      // 1. Try Lichess cloud eval.
      try {
        const res = await api.get('/openings/cloud-eval', {
          params: { fen, multiPv: 5 },
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
      if (workerRef.current) {
        workerRef.current.postMessage('stop');
        activeAnalysisFenRef.current = null;
        pendingFenRef.current        = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardGame]);

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

  return { evalData, evalLoading, evalSource };
}
