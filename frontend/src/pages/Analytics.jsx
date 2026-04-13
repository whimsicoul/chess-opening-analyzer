import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import api from '../api';
import OpeningSunburst from '../components/OpeningSunburst';
import ChessBoardViewer from '../components/ChessBoardViewer';
import './Analytics.css';

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

function isWin(result, playerColor) {
  if (!result || !playerColor) return null;
  if (playerColor === 'white') return result === '1-0';
  if (playerColor === 'black') return result === '0-1';
  return null;
}

function winRate(games) {
  const decided = games.filter(g => isWin(g.result, g.player_color) !== null);
  if (!decided.length) return null;
  return (decided.filter(g => isWin(g.result, g.player_color)).length / decided.length) * 100;
}

function fmt(rate) {
  return rate == null ? '—' : `${rate.toFixed(1)}%`;
}

const BAR_COLOR = (rate) => {
  if (rate == null) return '#2e3560';
  if (rate >= 55) return '#22c55e';
  if (rate >= 45) return '#c9a84c';
  return '#ef4444';
};

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return dateStr;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m,10)-1]} ${parseInt(d,10)}, ${y}`;
}

function movesToPgn(moves) {
  if (!moves.length) return null;
  return moves
    .map((m, i) => (i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ${m}` : m))
    .join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }) {
  return (
    <div className="stat-card" role="figure" aria-label={`${label}: ${value}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function GroupedWinRateTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip" role="tooltip">
      <div className="chart-tooltip-title">Move {label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.fill, marginTop: '0.2rem' }}>
          {p.dataKey === 'youRate' ? 'You' : 'Opponent'}:{' '}
          <strong>{fmt(p.value)}</strong>
          <span className="chart-tooltip-sub" style={{ marginLeft: '0.4rem' }}>
            ({p.payload[p.dataKey === 'youRate' ? 'youGames' : 'oppGames']} game
            {p.payload[p.dataKey === 'youRate' ? 'youGames' : 'oppGames'] !== 1 ? 's' : ''})
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Viz sub-components
// ─────────────────────────────────────────────────────────────────────────────

function MoveSequence({ moves }) {
  if (!moves.length) return null;
  const pairs = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({ n: Math.floor(i / 2) + 1, w: moves[i], b: moves[i + 1] });
  }
  return (
    <div className="move-seq" aria-label="Move sequence">
      {pairs.map(({ n, w, b }) => (
        <span key={n} className="move-pair">
          <span className="move-num" aria-hidden="true">{n}.</span>
          <span className="move-san">{w}</span>
          {b && <span className="move-san">{b}</span>}
        </span>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats section
// ─────────────────────────────────────────────────────────────────────────────

function StatsSection({ colorFilter }) {
  const [allGames, setAllGames] = useState([]);
  const [error, setError]       = useState(null);

  useEffect(() => {
    api.get('/games/')
      .then(res => setAllGames(res.data))
      .catch(() => setError('Failed to load games.'));
  }, []);

  const games = useMemo(() => {
    if (colorFilter === 'all') return allGames;
    return allGames.filter(g => g.player_color === colorFilter);
  }, [allGames, colorFilter]);

  const totalGames  = games.length;
  const overallWR   = winRate(games);
  const youDeviated = games.filter(g => g.opponent_deviation === false);
  const oppDeviated = games.filter(g => g.opponent_deviation === true);
  const noDeviation = games.filter(g => g.opponent_deviation == null);

  const byMoveSplit = useMemo(() => {
    const map = {};
    for (const g of games) {
      if (g.move_number == null) continue;
      const mn = g.move_number;
      if (!map[mn]) map[mn] = { you: [], opp: [] };
      if (g.opponent_deviation === false) map[mn].you.push(g);
      else if (g.opponent_deviation === true) map[mn].opp.push(g);
    }
    return Object.entries(map)
      .map(([move, { you, opp }]) => ({
        move:     Number(move),
        youRate:  winRate(you),
        youGames: you.length,
        oppRate:  winRate(opp),
        oppGames: opp.length,
      }))
      .sort((a, b) => a.move - b.move);
  }, [games]);

  const weaknesses = useMemo(() => {
    const map = {};
    for (const g of games) {
      if (!g.move_uci || g.opponent_deviation !== false) continue;
      if (!map[g.move_uci]) map[g.move_uci] = [];
      map[g.move_uci].push(g);
    }
    return Object.entries(map)
      .map(([move, gs]) => ({ move, games: gs.length, rate: winRate(gs) }))
      .filter(r => r.games >= 1)
      .sort((a, b) => {
        if (a.rate == null && b.rate == null) return b.games - a.games;
        if (a.rate == null) return 1;
        if (b.rate == null) return -1;
        return a.rate - b.rate;
      });
  }, [games]);

  if (error) return <div className="msg-error" role="alert">⚠ {error}</div>;

  if (totalGames === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '2.5rem' }}>
        <div style={{ fontSize: '2.5rem', opacity: 0.2, marginBottom: '0.75rem' }}>◑</div>
        <p className="muted">No games match this filter.</p>
      </div>
    );
  }

  return (
    <div className="stats-content" aria-label="Statistics section">
      <div className="stats-grid" role="list">
        <StatCard label="Total Games"            value={totalGames} />
        <StatCard
          label="Overall Win Rate"
          value={fmt(overallWR)}
          sub={`${games.filter(g => isWin(g.result, g.player_color)).length}W / ${games.filter(g => isWin(g.result, g.player_color) === false).length}L`}
        />
        <StatCard label="Win Rate — You Deviated"  value={fmt(winRate(youDeviated))} sub={`${youDeviated.length} game${youDeviated.length !== 1 ? 's' : ''}`} />
        <StatCard label="Win Rate — Opp. Deviated" value={fmt(winRate(oppDeviated))} sub={`${oppDeviated.length} game${oppDeviated.length !== 1 ? 's' : ''}`} />
        <StatCard label="Win Rate — In Repertoire" value={fmt(winRate(noDeviation))} sub={`${noDeviation.length} game${noDeviation.length !== 1 ? 's' : ''}`} />
      </div>

      {byMoveSplit.length > 0 && (
        <div className="card chart-card" aria-label="Win rate by deviation move number chart">
          <div className="card-label">Win Rate by Deviation Move — You vs Opponent</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byMoveSplit} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="30%" barGap={3}>
              <XAxis
                dataKey="move"
                tick={{ fill: '#5c6180', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#1e2338' }}
                label={{ value: 'Move #', position: 'insideBottom', offset: -2, fill: '#5c6180', fontSize: 11 }}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: '#5c6180', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => `${v}%`}
              />
              <Tooltip content={<GroupedWinRateTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Legend
                wrapperStyle={{ fontSize: '0.75rem', color: '#5c6180', paddingTop: '0.5rem' }}
                formatter={value => value === 'youRate' ? 'You Deviated' : 'Opp. Deviated'}
              />
              <Bar dataKey="youRate" name="youRate" fill="#f59e0b" radius={[3, 3, 0, 0]} />
              <Bar dataKey="oppRate" name="oppRate" fill="#22a8c5" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {weaknesses.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.5rem 0.75rem' }}>
            <div className="card-label">Your Deviation Moves — Weakest First</div>
          </div>
          <div className="table-wrap">
            <table aria-label="Deviation move weakness table">
              <thead>
                <tr>
                  <th scope="col">Move Played</th>
                  <th scope="col">Games</th>
                  <th scope="col">Win Rate</th>
                  <th scope="col" aria-label="Win rate bar"></th>
                </tr>
              </thead>
              <tbody>
                {weaknesses.map(row => {
                  const rate = row.rate;
                  const cls  = rate == null ? '' : rate >= 55 ? 'badge-green' : rate >= 45 ? 'badge-amber' : 'badge-red';
                  return (
                    <tr key={row.move}>
                      <td><code>{row.move}</code></td>
                      <td className="muted">{row.games}</td>
                      <td><span className={`badge ${cls}`}>{fmt(rate)}</span></td>
                      <td>
                        <div className="wr-bar-track" role="progressbar" aria-valuenow={rate ?? 0} aria-valuemin={0} aria-valuemax={100}>
                          <div className="wr-bar-fill" style={{ width: `${rate ?? 0}%`, background: BAR_COLOR(rate) }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <GamesList games={games} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Games list
// ─────────────────────────────────────────────────────────────────────────────

function GamesList({ games }) {
  if (!games.length) return null;

  const sorted = [...games].sort((a, b) =>
    !a.game_date || !b.game_date ? 0 : b.game_date.localeCompare(a.game_date)
  );

  function resultLabel(g) {
    const w = isWin(g.result, g.player_color);
    if (w === true)  return { text: 'Win',  cls: 'result-win'  };
    if (w === false) return { text: 'Loss', cls: 'result-loss' };
    return                  { text: 'Draw', cls: 'result-draw' };
  }

  function whoDeviated(g) {
    if (g.opponent_deviation == null) return { text: 'In Book',  cls: 'dev-book' };
    if (g.opponent_deviation === true) return { text: 'Opponent', cls: 'dev-opp'  };
    return                                    { text: 'You',      cls: 'dev-you'  };
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '1.25rem 1.5rem 0.75rem' }}>
        <div className="card-label">Games — Newest First</div>
      </div>
      <div className="table-wrap">
        <table aria-label="Games list">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Opening</th>
              <th scope="col">Result</th>
              <th scope="col">Who Deviated</th>
              <th scope="col">At Move</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(g => {
              const res = resultLabel(g);
              const dev = whoDeviated(g);
              return (
                <tr key={g.id}>
                  <td className="muted games-date">{fmtDate(g.game_date)}</td>
                  <td className="games-opening">
                    {g.eco_code && (
                      <span className="badge badge-eco" style={{ marginRight: '0.4rem' }}>{g.eco_code}</span>
                    )}
                    <span className="games-opening-name">{g.opening_name ?? '—'}</span>
                  </td>
                  <td><span className={`badge games-badge ${res.cls}`}>{res.text}</span></td>
                  <td><span className={`badge games-badge ${dev.cls}`}>{dev.text}</span></td>
                  <td className="muted">{g.move_number ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PGN helpers (shared with Visualization page)
// ─────────────────────────────────────────────────────────────────────────────

function parsePgnMoves(pgn) {
  if (!pgn) return [];
  let text = pgn
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\$\d+/g, ' ');
  return text.trim().split(/\s+/)
    .filter(t => t && !/^\d+\.+$/.test(t) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
}

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

    let parentId = treeData.id;
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

// ─────────────────────────────────────────────────────────────────────────────
// Visualization section
// ─────────────────────────────────────────────────────────────────────────────

function VizSection() {
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
      api.get(color === 'black' ? '/openings/black/tree' : '/openings/tree'),
      api.get('/games/'),
    ])
      .then(([treeRes, gamesRes]) => {
        setTreeData(treeRes.data);
        setGames(gamesRes.data);
      })
      .catch(() => setError('Failed to load opening tree.'))
      .finally(() => setLoading(false));
  }, [color]);

  const winRates = useMemo(
    () => (treeData && games.length ? buildWinRateMap(games, treeData, color) : {}),
    [treeData, games, color],
  );

  // Only update the panel when there is actual content — never clear on hover-out.
  const handleActivePath = useCallback((moves, info) => {
    if (moves.length > 0 || info) {
      setActiveMoves(moves);
      setActiveInfo(info);
    }
  }, []);

  const pgn     = movesToPgn(activeMoves);
  const isEmpty = treeData && (!treeData.children || treeData.children.length === 0);

  if (error) return <div className="msg-error" role="alert">⚠ {error}</div>;

  if (loading) {
    return (
      <div className="viz-loading" role="status" aria-label="Loading opening tree">
        <div className="viz-spinner" aria-hidden="true" />
        <span className="muted">Loading opening tree…</span>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <>
        <div className="viz-color-toggle" style={{ marginBottom: '1rem' }}>
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
        <div className="card" style={{ textAlign: 'center', padding: '2.5rem' }}>
          <div style={{ fontSize: '2.5rem', opacity: 0.18, marginBottom: '0.75rem' }}>♟</div>
          <p className="muted">
            No {color} opening lines in your repertoire yet.{' '}
            <a href="/repertoire">Add some lines →</a>
          </p>
        </div>
      </>
    );
  }

  return (
    <div aria-label="Opening visualization">
      {/* Color toggle */}
      <div className="viz-color-toggle" style={{ marginBottom: '1rem' }}>
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

      <div className="viz-layout">
        <div className="viz-chart-col">
          <OpeningSunburst
            key={color}
            data={treeData}
            winRates={winRates}
            onActivePath={handleActivePath}
          />
          <div className="viz-legend" aria-label="Legend">
            <div className="viz-legend-label">Hue — win rate (when game data exists)</div>
            <div className="viz-legend-item">
              <div className="viz-legend-dot" style={{ background: 'hsl(105,52%,30%)' }} aria-hidden="true" />
              <span>High win rate (&gt;55%)</span>
            </div>
            <div className="viz-legend-item">
              <div className="viz-legend-dot" style={{ background: 'hsl(47,52%,30%)' }} aria-hidden="true" />
              <span>Neutral (45–55%)</span>
            </div>
            <div className="viz-legend-item">
              <div className="viz-legend-dot" style={{ background: 'hsl(0,52%,30%)' }} aria-hidden="true" />
              <span>Low win rate (&lt;45%)</span>
            </div>
            <div className="viz-legend-label" style={{ marginTop: '0.5rem' }}>Hue — depth (no game data)</div>
            <div className="viz-legend-item">
              <div className="viz-legend-dot" style={{ background: 'hsl(145,52%,32%)' }} aria-hidden="true" />
              <span>Early moves (depth 1–3)</span>
            </div>
            <div className="viz-legend-item">
              <div className="viz-legend-dot" style={{ background: 'hsl(65,50%,30%)' }} aria-hidden="true" />
              <span>Mid lines (depth 4–5)</span>
            </div>
            <div className="viz-legend-item">
              <div className="viz-legend-dot" style={{ background: 'hsl(18,50%,28%)' }} aria-hidden="true" />
              <span>Deep lines (depth 6+)</span>
            </div>
          </div>
        </div>

        <div className="viz-info-col">
          {activeInfo ? (
            <div className="viz-node-card" role="region" aria-label={`Active position: ${activeInfo.name}`}>
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

          {activeMoves.length > 0 && (
            <div className="viz-seq-wrap">
              <div className="card-label">Move Sequence</div>
              <MoveSequence moves={activeMoves} />
            </div>
          )}

          {pgn ? (
            <div
              role="region"
              aria-label={`Chessboard for opening: ${activeInfo?.opening_name ?? activeMoves.join(' ')}`}
            >
              <ChessBoardViewer pgn={pgn} highlightIndex={activeMoves.length} />
            </div>
          ) : (
            <div className="viz-board-empty" aria-label="Board placeholder">
              <div className="viz-board-empty-icon" aria-hidden="true">♜</div>
              <p className="muted">Click a segment to navigate to a position</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Analytics page
// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'stats', label: '📊 Statistics' },
  { id: 'viz',   label: '🌀 Visualization' },
];

export default function Analytics() {
  const [activeTab,    setActiveTab]    = useState('stats');
  const [colorFilter,  setColorFilter]  = useState('all');

  return (
    <main className="page">
      <div className="page-header">
        <h1>Analytics</h1>
        <p>Performance statistics and opening repertoire visualization</p>
      </div>

      {/* ── Tab navigation ── */}
      <nav className="analytics-tabs" aria-label="Analytics sections" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            id={`tab-${tab.id}`}
            className={`analytics-tab ${activeTab === tab.id ? 'analytics-tab-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* ── Unified filter bar (shown only for Stats tab) ── */}
      {activeTab === 'stats' && (
        <div
          className="filter-row"
          role="group"
          aria-label="Filter games by color"
        >
          {['all', 'white', 'black'].map(c => (
            <button
              key={c}
              className={`filter-btn ${colorFilter === c ? 'filter-btn-active' : ''}`}
              onClick={() => setColorFilter(c)}
              aria-pressed={colorFilter === c}
            >
              {c === 'all' ? 'All Games' : c === 'white' ? '♔ White' : '♚ Black'}
            </button>
          ))}
        </div>
      )}

      {/* ── Tab panels ── */}
      <div
        id="tabpanel-stats"
        role="tabpanel"
        aria-labelledby="tab-stats"
        hidden={activeTab !== 'stats'}
      >
        {activeTab === 'stats' && <StatsSection colorFilter={colorFilter} />}
      </div>

      <div
        id="tabpanel-viz"
        role="tabpanel"
        aria-labelledby="tab-viz"
        hidden={activeTab !== 'viz'}
      >
        {activeTab === 'viz' && <VizSection />}
      </div>
    </main>
  );
}
