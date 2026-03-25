import { useEffect, useState, useCallback, useMemo } from 'react';
import api from '../api';
import OpeningSunburst from '../components/OpeningSunburst';
import ChessBoardViewer from '../components/ChessBoardViewer';
import './Visualization.css';

// ── PGN helpers ───────────────────────────────────────────────────────────────

function parsePgnMoves(pgn) {
  if (!pgn) return [];
  let text = pgn
    .replace(/\[[^\]]*\]/g, '')  // remove [Tag "Value"] headers
    .replace(/\{[^}]*\}/g, ' ') // remove { comments }
    .replace(/\([^)]*\)/g, ' ') // remove (variations)
    .replace(/\$\d+/g, ' ');    // remove $NAG annotations
  return text.trim().split(/\s+/)
    .filter(t => t && !/^\d+\.+$/.test(t) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
}

// Returns { [nodeId]: { winRate, wins, draws, losses, total } }
function buildWinRateMap(games, treeData, color) {
  const childMap = {};
  function index(node) {
    if (node.children?.length) {
      childMap[node.id] = node.children.map(c => ({ id: c.id, name: c.name }));
      node.children.forEach(index);
    }
  }
  index(treeData);

  const stats = {};
  for (const game of games.filter(g => g.player_color === color)) {
    if (!game.result || game.result === '*') continue;
    const moves = parsePgnMoves(game.pgn);
    const win  = color === 'white' ? game.result === '1-0' : game.result === '0-1';
    const draw = game.result === '1/2-1/2';

    let parentId = treeData.id; // 0
    for (const san of moves) {
      const match = (childMap[parentId] || []).find(c => c.name === san);
      if (!match) break;
      if (!stats[match.id]) stats[match.id] = { wins: 0, draws: 0, losses: 0 };
      if (win) stats[match.id].wins++;
      else if (draw) stats[match.id].draws++;
      else stats[match.id].losses++;
      parentId = match.id;
    }
  }

  const result = {};
  for (const [id, s] of Object.entries(stats)) {
    const total = s.wins + s.draws + s.losses;
    result[id] = { winRate: (s.wins / total) * 100, ...s, total };
  }
  return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function movesToPgn(moves) {
  if (!moves.length) return null;
  return moves
    .map((m, i) => (i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ${m}` : m))
    .join(' ');
}

function MoveSequence({ moves }) {
  if (!moves.length) return null;
  const pairs = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({ n: Math.floor(i / 2) + 1, w: moves[i], b: moves[i + 1] });
  }
  return (
    <div className="move-seq">
      {pairs.map(({ n, w, b }) => (
        <span key={n} className="move-pair">
          <span className="move-num">{n}.</span>
          <span className="move-san">{w}</span>
          {b && <span className="move-san">{b}</span>}
        </span>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Visualization() {
  const [color,       setColor      ] = useState('white');
  const [treeData,    setTreeData   ] = useState(null);
  const [games,       setGames      ] = useState([]);
  const [loading,     setLoading    ] = useState(true);
  const [error,       setError      ] = useState(null);
  const [activeMoves, setActiveMoves] = useState([]);
  const [activeInfo,  setActiveInfo ] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get('/openings/tree', { params: { color } }),
      api.get('/games/'),
    ])
      .then(([treeRes, gamesRes]) => {
        setTreeData(treeRes.data);
        setGames(gamesRes.data);
      })
      .catch(() => setError('Failed to load data.'))
      .finally(() => setLoading(false));
  }, [color]);

  const winRates = useMemo(
    () => (treeData && games.length ? buildWinRateMap(games, treeData, color) : {}),
    [treeData, games, color],
  );

  const handleActivePath = useCallback((moves, info) => {
    setActiveMoves(moves);
    setActiveInfo(info);
  }, []);

  const pgn     = movesToPgn(activeMoves);
  const isEmpty = treeData && (!treeData.children || treeData.children.length === 0);

  return (
    <main className="page">
      <div className="page-header">
        <h1>Opening Visualization</h1>
        <p>Explore your repertoire as an interactive sunburst — hover to preview, click to zoom in</p>
      </div>

      {/* ── Color toggle ─────────────────────────────────────────────────── */}
      <div className="viz-color-toggle">
        {['white', 'black'].map(c => (
          <button
            key={c}
            className={`toggle-btn ${color === c ? 'active' : ''}`}
            onClick={() => { setColor(c); setActiveMoves([]); setActiveInfo(null); }}
          >
            {c === 'white' ? '♔ White' : '♚ Black'}
          </button>
        ))}
      </div>

      {error && <div className="msg-error">⚠ {error}</div>}

      {loading && (
        <div className="viz-loading">
          <div className="viz-spinner" />
          <span className="muted">Loading opening tree…</span>
        </div>
      )}

      {!loading && isEmpty && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '2.5rem', opacity: 0.18, marginBottom: '0.75rem' }}>♟</div>
          <p className="muted">
            No {color} opening lines in your repertoire yet.{' '}
            <a href="/repertoire">Add some lines →</a>
          </p>
        </div>
      )}

      {!loading && treeData && !isEmpty && (
        <div className="viz-layout">

          {/* ── Left: Sunburst ──────────────────────────────────────────── */}
          <div className="viz-chart-col">
            <OpeningSunburst
              key={color}
              data={treeData}
              winRates={winRates}
              onActivePath={handleActivePath}
            />

            {/* Legend */}
            <div className="viz-legend">
              <div className="viz-legend-label">Hue — win rate (when game data exists)</div>
              <div className="viz-legend-item">
                <div className="viz-legend-dot" style={{ background: 'hsl(105,52%,30%)' }} />
                <span>High win rate (&gt;55%)</span>
              </div>
              <div className="viz-legend-item">
                <div className="viz-legend-dot" style={{ background: 'hsl(47,52%,30%)' }} />
                <span>Neutral (45–55%)</span>
              </div>
              <div className="viz-legend-item">
                <div className="viz-legend-dot" style={{ background: 'hsl(0,52%,30%)' }} />
                <span>Low win rate (&lt;45%)</span>
              </div>
              <div className="viz-legend-label" style={{ marginTop: '0.5rem' }}>Hue — depth (no game data)</div>
              <div className="viz-legend-item">
                <div className="viz-legend-dot" style={{ background: 'hsl(145,52%,32%)' }} />
                <span>Early moves (depth 1–3)</span>
              </div>
              <div className="viz-legend-item">
                <div className="viz-legend-dot" style={{ background: 'hsl(65,50%,30%)' }} />
                <span>Mid lines (depth 4–5)</span>
              </div>
              <div className="viz-legend-item">
                <div className="viz-legend-dot" style={{ background: 'hsl(18,50%,28%)' }} />
                <span>Deep lines (depth 6+)</span>
              </div>
            </div>
          </div>

          {/* ── Right: Info + Board ─────────────────────────────────────── */}
          <div className="viz-info-col">

            {/* Active node info */}
            {activeInfo ? (
              <div className="viz-node-card">
                <div className="viz-node-move">{activeInfo.name}</div>
                {activeInfo.opening_name && (
                  <div className="viz-node-opening">{activeInfo.opening_name}</div>
                )}
                {activeInfo.eco_code && (
                  <span className="badge badge-eco" style={{ marginTop: '0.25rem', display: 'inline-block' }}>
                    {activeInfo.eco_code}
                  </span>
                )}
              </div>
            ) : (
              <div className="viz-idle">
                <span className="muted">Hover a segment to preview a position</span>
              </div>
            )}

            {/* Move sequence */}
            {activeMoves.length > 0 && (
              <div className="viz-seq-wrap">
                <div className="card-label">Move Sequence</div>
                <MoveSequence moves={activeMoves} />
              </div>
            )}

            {/* Chessboard */}
            {pgn ? (
              <ChessBoardViewer
                pgn={pgn}
                highlightIndex={activeMoves.length}
              />
            ) : (
              <div className="viz-board-empty">
                <div className="viz-board-empty-icon">♜</div>
                <p className="muted">Click a segment to navigate to a position</p>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
