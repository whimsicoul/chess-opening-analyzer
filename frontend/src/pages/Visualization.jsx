import { useEffect, useState, useCallback } from 'react';
import api from '../api';
import OpeningSunburst from '../components/OpeningSunburst';
import ChessBoardViewer from '../components/ChessBoardViewer';
import './Visualization.css';

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
  const [winRates,    setWinRates   ] = useState({});
  const [loading,     setLoading    ] = useState(true);
  const [error,       setError      ] = useState(null);
  const [activeMoves, setActiveMoves] = useState([]);
  const [activeInfo,  setActiveInfo ] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get('/openings/tree', { params: { color } }),
      api.get('/openings/winrates', { params: { color } }),
    ])
      .then(([treeRes, wrRes]) => {
        setTreeData(treeRes.data);
        setWinRates(wrRes.data);
      })
      .catch(() => setError('Failed to load data.'))
      .finally(() => setLoading(false));
  }, [color]);

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
              <div className="viz-legend-label">Hue — win rate</div>
              <div className="viz-legend-item">
                <div className="viz-legend-dot" style={{ background: 'hsl(120,48%,16%)' }} />
                <span>&gt;60%</span>
              </div>
              <div className="viz-legend-item">
                <div className="viz-legend-dot" style={{ background: 'hsl(112,48%,28%)' }} />
                <span>55–60%</span>
              </div>
              <div className="viz-legend-item">
                <div className="viz-legend-dot" style={{ background: 'hsl(88,48%,36%)' }} />
                <span>50–55%</span>
              </div>
              <div className="viz-legend-item">
                <div className="viz-legend-dot" style={{ background: 'hsl(52,48%,36%)' }} />
                <span>48–50%</span>
              </div>
              <div className="viz-legend-item">
                <div className="viz-legend-dot" style={{ background: 'hsl(22,48%,32%)' }} />
                <span>45–48%</span>
              </div>
              <div className="viz-legend-item">
                <div className="viz-legend-dot" style={{ background: 'hsl(0,48%,28%)' }} />
                <span>&lt;45%</span>
              </div>
              <div className="viz-legend-item">
                <div className="viz-legend-dot" style={{ background: 'hsl(220,12%,22%)' }} />
                <span>No game data</span>
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
                {winRates[activeInfo.id] ? (() => {
                  const s = winRates[activeInfo.id];
                  const wr = s.winRate;
                  const cls = wr >= 55 ? 'badge-green' : wr >= 45 ? 'badge-amber' : 'badge-red';
                  return (
                    <div className="viz-node-stats">
                      <span className={`badge ${cls}`}>{wr.toFixed(1)}% win rate</span>
                      <span className="viz-node-record">{s.wins}W · {s.draws}D · {s.losses}L</span>
                      {s.avgOppRating != null && (
                        <span className="viz-node-rating">Avg opp rating: <strong>{s.avgOppRating}</strong></span>
                      )}
                    </div>
                  );
                })() : (
                  <div className="viz-node-stats">
                    <span className="muted" style={{ fontSize: '0.78rem' }}>No game data for this position</span>
                  </div>
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
