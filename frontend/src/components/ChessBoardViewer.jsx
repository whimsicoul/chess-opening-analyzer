import { useState, useEffect, useRef, useCallback } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { woodenPieces } from "../utils/woodenPieces.jsx";
import "./ChessBoardViewer.css";

export default function ChessBoardViewer({
  pgn,
  highlightIndex = null,
  deviationColor = "red",
  deviationLabel = null,
}) {
  const [positions, setPositions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const moveListRef = useRef(null);

  // ─────────────────────────────────────────────────────────────
  // Build positions from PGN (source of truth)
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pgn) {
      setPositions([]);
      setCurrentIndex(0);
      return;
    }

    try {
      const chess = new Chess();
      chess.loadPgn(pgn);

      const history = chess.history({ verbose: true });

      const temp = new Chess();
      const newPositions = [
        {
          fen: temp.fen(),
          move: null,
        },
      ];

      history.forEach((mv) => {
        temp.move(mv.san);
        newPositions.push({
          fen: temp.fen(),
          move: mv,
        });
      });

      setPositions(newPositions);

      const startIndex =
        highlightIndex != null
          ? Math.min(highlightIndex, newPositions.length - 1)
          : 0;

      setCurrentIndex(startIndex);
    } catch (err) {
      console.error("Invalid PGN:", err);
      setPositions([]);
      setCurrentIndex(0);
    }
  }, [pgn, highlightIndex]);

  // ─────────────────────────────────────────────────────────────
  // Auto-scroll active move into view
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!moveListRef.current) return;
    const active = moveListRef.current.querySelector(
      ".board-move-btn-active"
    );
    if (active) {
      active.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [currentIndex]);

  // ─────────────────────────────────────────────────────────────
  // Keyboard navigation
  // ─────────────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e) => {
      if (!positions.length) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentIndex((i) => Math.max(0, i - 1));
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        setCurrentIndex((i) =>
          Math.min(positions.length - 1, i + 1)
        );
      }

      if (e.key === "Home") {
        e.preventDefault();
        setCurrentIndex(0);
      }

      if (e.key === "End") {
        e.preventDefault();
        setCurrentIndex(positions.length - 1);
      }
    },
    [positions.length]
  );

  // ─────────────────────────────────────────────────────────────
  // Early exit
  // ─────────────────────────────────────────────────────────────
  if (!pgn || positions.length === 0) return null;

  const current = positions[currentIndex];
  const isStart = currentIndex === 0;
  const isEnd = currentIndex === positions.length - 1;

  // ─────────────────────────────────────────────────────────────
  // Square highlights
  // ─────────────────────────────────────────────────────────────
  let squareStyles = {};

  if (currentIndex > 0 && current.move) {
    squareStyles = {
      [current.move.from]: {
        background: "rgba(255, 255, 0, 0.3)",
      },
      [current.move.to]: {
        background: "rgba(255, 255, 0, 0.5)",
      },
    };
  }

  if (
    highlightIndex != null &&
    currentIndex === highlightIndex &&
    current.move
  ) {
    const color =
      deviationColor === "amber"
        ? "rgba(245, 158, 11, 0.6)"
        : "rgba(239, 68, 68, 0.6)";

    squareStyles = {
      [current.move.from]: { background: color },
      [current.move.to]: { background: color },
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Move display text
  // ─────────────────────────────────────────────────────────────
  let moveDisplay = "Start";

  if (currentIndex > 0 && current.move) {
    const moveNumber = Math.ceil(currentIndex / 2);
    const isWhite = currentIndex % 2 === 1;

    moveDisplay = `${moveNumber}${isWhite ? "." : "..."} ${current.move.san}`;
  }

  // ─────────────────────────────────────────────────────────────
  // Build move list
  // ─────────────────────────────────────────────────────────────
  const movePairs = [];

  for (let i = 1; i < positions.length; i += 2) {
    movePairs.push({
      n: Math.ceil(i / 2),
      white: {
        idx: i,
        san: positions[i].move.san,
      },
      black: positions[i + 1]
        ? {
            idx: i + 1,
            san: positions[i + 1].move.san,
          }
        : null,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  return (
    <div
      className="board-viewer"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {deviationLabel && (
        <div
          className={`board-deviation-label board-dev-${deviationColor}`}
        >
          {deviationLabel}
        </div>
      )}

      <div className="board-move-row">
        <span className="board-move-display">
          {moveDisplay}
        </span>
        <span className="board-counter">
          {currentIndex} / {positions.length - 1}
        </span>
      </div>

      <div className="board-outer">
        <div className="board-wrap">
        <Chessboard
          position={current.fen}
          arePiecesDraggable={false}
          animationDuration={150}
          customSquareStyles={squareStyles}
          customPieces={woodenPieces}
          customBoardStyle={{ backgroundImage: "url(/wood4.jpg)", backgroundSize: "100% 100%" }}
          customDarkSquareStyle={{}}
          customLightSquareStyle={{}}
        />
        </div>
      </div>

      <div className="board-controls">
        <button onClick={() => setCurrentIndex(0)} disabled={isStart}>
          ⟪ Start
        </button>

        <button
          onClick={() =>
            setCurrentIndex((i) => Math.max(0, i - 1))
          }
          disabled={isStart}
        >
          ← Prev
        </button>

        <button
          onClick={() =>
            setCurrentIndex((i) =>
              Math.min(positions.length - 1, i + 1)
            )
          }
          disabled={isEnd}
        >
          Next →
        </button>

        <button
          onClick={() =>
            setCurrentIndex(positions.length - 1)
          }
          disabled={isEnd}
        >
          End ⟫
        </button>
      </div>

      <div className="board-move-list" ref={moveListRef}>
        {movePairs.map(({ n, white, black }) => (
          <span key={n} className="board-move-pair">
            <span className="board-move-num">{n}.</span>

            <button
              className={
                "board-move-btn" +
                (currentIndex === white.idx
                  ? " board-move-btn-active"
                  : "")
              }
              onClick={() => setCurrentIndex(white.idx)}
            >
              {white.san}
            </button>

            {black && (
              <button
                className={
                  "board-move-btn" +
                  (currentIndex === black.idx
                    ? " board-move-btn-active"
                    : "")
                }
                onClick={() =>
                  setCurrentIndex(black.idx)
                }
              >
                {black.san}
              </button>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}