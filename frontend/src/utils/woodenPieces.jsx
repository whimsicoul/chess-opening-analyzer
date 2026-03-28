const BASE = "https://www.chess.com/chess-themes/pieces/wood/150";

const piece = (code) => ({ squareWidth }) => (
  <img
    src={`${BASE}/${code}.png`}
    style={{ width: squareWidth, height: squareWidth }}
    alt={code}
  />
);

export const woodenPieces = {
  wK: piece("wk"),
  wQ: piece("wq"),
  wR: piece("wr"),
  wB: piece("wb"),
  wN: piece("wn"),
  wP: piece("wp"),
  bK: piece("bk"),
  bQ: piece("bq"),
  bR: piece("br"),
  bB: piece("bb"),
  bN: piece("bn"),
  bP: piece("bp"),
};
