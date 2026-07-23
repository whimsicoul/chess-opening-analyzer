import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { useEngine } from '../hooks/useEngine';
import OpeningSunburst from '../components/OpeningSunburst';
import ChessBoardViewer from '../components/ChessBoardViewer';
import './Analytics.css';

// ── Helpers ───────────────────────────────────────────────────────────────────

function movesToPgn(moves) {
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

export default function Analytics() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [color,       setColor      ] = useState('white');
  const [treeData,    setTreeData   ] = useState(null);
  const [winRates,    setWinRates   ] = useState({});
  const [loading,     setLoading    ] = useState(true);
  const [error,       setError      ] = useState(null);
  const [activeMoves, setActiveMoves] = useState([]);
  const [activeInfo,  setActiveInfo ] = useState(null);
  const [weakLines,   setWeakLines  ] = useState([]);

  // Live board built from the hovered/selected sunburst node — feeds both the
  // engine mini-readout below and the "Open in Repertoire" click-through.
  const activeBoard = useMemo(() => {
    if (!activeMoves.length) return null;
    const g = new Chess();
    for (const san of activeMoves) {
      try {
        if (!g.move(san)) return null;
      } catch {
        return null;
      }
    }
    return g;
  }, [activeMoves]);

  const { evalData, evalLoading } = useEngine(activeBoard, { engineMode: false });
  const topEval = evalData?.pvs?.[0] ? formatEval(evalData.pvs[0].cp, evalData.pvs[0].mate ?? null) : null;
  const topMoveSan = useMemo(() => {
    const uci = evalData?.pvs?.[0]?.moves?.split(' ')[0];
    if (!uci || !activeBoard) return null;
    try {
      const preview = new Chess(activeBoard.fen());
      const move = preview.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
      return move?.san ?? null;
    } catch {
      return null;
    }
  }, [evalData, activeBoard]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get(color === 'black' ? '/openings/black/tree' : '/openings/tree'),
      api.get('/openings/winrates', { params: { color } }),
      api.get('/openings/weaknesses', { params: { color, min_games: 5, max_win_rate: 45 } }),
    ])
      .then(([treeRes, wrRes, weakRes]) => {
        setTreeData(treeRes.data);
        setWinRates(wrRes.data);
        setWeakLines(weakRes.data ?? []);
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
        <h1>Analytics</h1>
        <p>Explore your repertoire as an interactive sunburst — hover to preview, click to zoom in</p>
      </div>

      {/* ── Color toggle + legend ────────────────────────────────────────── */}
      <div className="viz-toolbar">
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

        <div className="viz-legend">
          <span className="viz-legend-label">Win rate</span>
          <span className="viz-legend-item">
            <span className="viz-legend-dot" style={{ background: 'hsl(120,48%,16%)' }} />&gt;60%
          </span>
          <span className="viz-legend-item">
            <span className="viz-legend-dot" style={{ background: 'hsl(112,48%,28%)' }} />55–60%
          </span>
          <span className="viz-legend-item">
            <span className="viz-legend-dot" style={{ background: 'hsl(88,48%,36%)' }} />50–55%
          </span>
          <span className="viz-legend-item">
            <span className="viz-legend-dot" style={{ background: 'hsl(52,48%,36%)' }} />48–50%
          </span>
          <span className="viz-legend-item">
            <span className="viz-legend-dot" style={{ background: 'hsl(22,48%,32%)' }} />45–48%
          </span>
          <span className="viz-legend-item">
            <span className="viz-legend-dot" style={{ background: 'hsl(0,48%,28%)' }} />&lt;45%
          </span>
          <span className="viz-legend-item">
            <span className="viz-legend-dot" style={{ background: 'hsl(220,12%,22%)' }} />No data
          </span>
          <span className="viz-legend-item">
            <span className="viz-legend-dot viz-legend-dot-outline" style={{ borderColor: '#ff4d4f' }} />Weak spot (3+ games, &lt;30% wins)
          </span>
        </div>
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
          {isAuthenticated ? (
            <p className="muted">
              No {color} opening lines in your repertoire yet.{' '}
              <Link to="/repertoire">Add some lines →</Link>
            </p>
          ) : (
            <p className="muted">
              Build a {color} repertoire on the <Link to="/repertoire">Repertoire page</Link> to see it visualized here
              — sign in to save your lines and track win rates.
            </p>
          )}
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

            {weakLines.length > 0 && (
              <div className="viz-weak-lines">
                <div className="card-label">Weakest Lines</div>
                <div className="viz-weak-list">
                  {weakLines.slice(0, 8).map(w => (
                    <button
                      key={w.node_id}
                      type="button"
                      className="viz-weak-row"
                      onMouseEnter={() => handleActivePath(w.path, { name: w.move_san, id: w.node_id })}
                      onClick={() => navigate('/repertoire', { state: { moves: w.path, color } })}
                    >
                      <span className="viz-weak-path">{w.path.join(' ')}</span>
                      <span className="badge badge-red">{w.winRate.toFixed(0)}%</span>
                      <span className="viz-weak-sample">{w.total}g</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
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
                        <span className="viz-node-rating">
                          Avg opp rating: <strong>{s.avgOppRating}</strong>
                          {s.ratingMin != null && s.ratingMax != null && (
                            <> ({s.ratingMin}–{s.ratingMax})</>
                          )}
                        </span>
                      )}
                      {s.lastPlayed && (
                        <span className="viz-node-last-played">Last played: <strong>{s.lastPlayed}</strong></span>
                      )}
                    </div>
                  );
                })() : (
                  <div className="viz-node-stats">
                    <span className="muted" style={{ fontSize: '0.78rem' }}>No game data for this position</span>
                  </div>
                )}

                {/* Inline engine opinion */}
                <div className="viz-engine-mini">
                  {evalLoading && !topEval ? (
                    <span className="muted" style={{ fontSize: '0.78rem' }}>Checking engine…</span>
                  ) : topEval ? (
                    <span className="viz-engine-mini-line">
                      Engine: <strong className={topEval.startsWith('-') ? 'eval-neg' : 'eval-pos'}>{topEval}</strong>
                      {topMoveSan && <> · best: <strong>{topMoveSan}</strong></>}
                    </span>
                  ) : null}
                </div>

                <button
                  type="button"
                  className="btn btn-ghost viz-open-repertoire-btn"
                  onClick={() => navigate('/repertoire', { state: { moves: activeMoves, color } })}
                >
                  Open in Repertoire →
                </button>
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
                showControls={false}
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
