import { useEffect, useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import api from '../api';
import './Stats.css';

// ── Helpers ──────────────────────────────────────────────────────────────────

function isWin(result, playerColor) {
  if (!result || !playerColor) return null;
  if (playerColor === 'white') return result === '1-0';
  if (playerColor === 'black') return result === '0-1';
  return null;
}

function winRate(games) {
  const decided = games.filter(g => isWin(g.result, g.player_color) !== null);
  if (!decided.length) return null;
  const wins = decided.filter(g => isWin(g.result, g.player_color));
  return (wins.length / decided.length) * 100;
}

function fmt(rate) {
  return rate == null ? '—' : `${rate.toFixed(1)}%`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

const BAR_COLOR_FN = (rate) => {
  if (rate == null) return '#2e3560';
  if (rate >= 55) return '#22c55e';
  if (rate >= 45) return '#c9a84c';
  return '#ef4444';
};

function WinRateTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">Move {d.move}</div>
      <div>Win rate: <strong>{fmt(d.rate)}</strong></div>
      <div className="chart-tooltip-sub">{d.games} game{d.games !== 1 ? 's' : ''}</div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Stats() {
  const [allGames, setAllGames] = useState([]);
  const [error, setError]       = useState(null);
  const [colorFilter, setColorFilter] = useState('all');

  useEffect(() => {
    api.get('/games/')
      .then(res => setAllGames(res.data))
      .catch(() => setError('Failed to load games.'));
  }, []);

  const games = useMemo(() => {
    if (colorFilter === 'all') return allGames;
    return allGames.filter(g => g.player_color === colorFilter);
  }, [allGames, colorFilter]);

  // ── Aggregate stats ──
  const totalGames   = games.length;
  const overallWR    = winRate(games);

  const youDeviated  = games.filter(g => g.opponent_deviation === false);
  const oppDeviated  = games.filter(g => g.opponent_deviation === true);
  const noDeviation  = games.filter(g => g.opponent_deviation == null);

  const youDevWR  = winRate(youDeviated);
  const oppDevWR  = winRate(oppDeviated);
  const noDevWR   = winRate(noDeviation);

  // ── Bar chart: win rate by deviation move number ──
  const byMove = useMemo(() => {
    const map = {};
    for (const g of games) {
      if (g.move_number == null) continue;
      if (!map[g.move_number]) map[g.move_number] = [];
      map[g.move_number].push(g);
    }
    return Object.entries(map)
      .map(([move, gs]) => ({ move: Number(move), games: gs.length, rate: winRate(gs) }))
      .sort((a, b) => a.move - b.move);
  }, [games]);

  // ── Weakness table: deviation moves ranked by win rate ──
  const weaknesses = useMemo(() => {
    const map = {};
    for (const g of games) {
      if (!g.move_uci || g.opponent_deviation !== false) continue; // only your deviations
      if (!map[g.move_uci]) map[g.move_uci] = [];
      map[g.move_uci].push(g);
    }
    return Object.entries(map)
      .map(([move, gs]) => ({ move, games: gs.length, rate: winRate(gs) }))
      .filter(r => r.games >= 1)
      .sort((a, b) => {
        // null rates go to bottom, then sort by win rate ascending (weakest first)
        if (a.rate == null && b.rate == null) return b.games - a.games;
        if (a.rate == null) return 1;
        if (b.rate == null) return -1;
        return a.rate - b.rate;
      });
  }, [games]);

  return (
    <main className="page">
      <div className="page-header">
        <h1>Statistics</h1>
        <p>Performance breakdown across your analyzed games</p>
      </div>

      {error && <div className="msg-error">⚠ {error}</div>}

      {/* ── Color filter ── */}
      <div className="filter-row">
        {['all', 'white', 'black'].map(c => (
          <button
            key={c}
            className={`filter-btn ${colorFilter === c ? 'filter-btn-active' : ''}`}
            onClick={() => setColorFilter(c)}
          >
            {c === 'all' ? 'All Games' : c === 'white' ? '♔ White' : '♚ Black'}
          </button>
        ))}
      </div>

      {totalGames === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '2.5rem', opacity: 0.2, marginBottom: '0.75rem' }}>◑</div>
          <p className="muted">No games match this filter.</p>
        </div>
      ) : (
        <>
          {/* ── Summary cards ── */}
          <div className="stats-grid">
            <StatCard label="Total Games" value={totalGames} />
            <StatCard
              label="Overall Win Rate"
              value={fmt(overallWR)}
              sub={`${games.filter(g => isWin(g.result, g.player_color)).length}W / ${games.filter(g => isWin(g.result, g.player_color) === false).length}L`}
            />
            <StatCard
              label="Win Rate — You Deviated"
              value={fmt(youDevWR)}
              sub={`${youDeviated.length} game${youDeviated.length !== 1 ? 's' : ''}`}
            />
            <StatCard
              label="Win Rate — Opp. Deviated"
              value={fmt(oppDevWR)}
              sub={`${oppDeviated.length} game${oppDeviated.length !== 1 ? 's' : ''}`}
            />
            <StatCard
              label="Win Rate — In Repertoire"
              value={fmt(noDevWR)}
              sub={`${noDeviation.length} game${noDeviation.length !== 1 ? 's' : ''}`}
            />
          </div>

          {/* ── Bar chart ── */}
          {byMove.length > 0 && (
            <div className="card chart-card">
              <div className="card-label">Win Rate by Deviation Move Number</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byMove} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
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
                  <Tooltip content={<WinRateTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                    {byMove.map(entry => (
                      <Cell key={entry.move} fill={BAR_COLOR_FN(entry.rate)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Weakness table ── */}
          {weaknesses.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '1.25rem 1.5rem 0.75rem' }}>
                <div className="card-label">Your Deviation Moves — Weakest First</div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Move Played</th>
                      <th>Games</th>
                      <th>Win Rate</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {weaknesses.map(row => {
                      const rate = row.rate;
                      const cls = rate == null ? '' : rate >= 55 ? 'badge-green' : rate >= 45 ? 'badge-amber' : 'badge-red';
                      return (
                        <tr key={row.move}>
                          <td><code>{row.move}</code></td>
                          <td className="muted">{row.games}</td>
                          <td>
                            <span className={`badge ${cls}`}>{fmt(rate)}</span>
                          </td>
                          <td>
                            <div className="wr-bar-track">
                              <div
                                className="wr-bar-fill"
                                style={{
                                  width: `${rate ?? 0}%`,
                                  background: BAR_COLOR_FN(rate),
                                }}
                              />
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
        </>
      )}
    </main>
  );
}
