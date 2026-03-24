import { useEffect, useState } from 'react';
import api from '../api';

export default function Games() {
  const [games, setGames] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/games/')
      .then(res => setGames(res.data))
      .catch(() => setError('Failed to load games.'));
  }, []);

  return (
    <main className="page">
      <h1>Analyzed Games</h1>

      {error && <p className="error">{error}</p>}

      <div className="card">
        {games.length === 0 ? (
          <p className="muted">No games uploaded yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Date</th>
                <th>Result</th>
                <th>Opening</th>
                <th>ECO</th>
                <th>Deviation</th>
                <th>Move #</th>
                <th>Move played</th>
              </tr>
            </thead>
            <tbody>
              {games.map(g => (
                <tr key={g.id}>
                  <td>{g.id}</td>
                  <td>{g.game_date ?? '—'}</td>
                  <td>{g.result ?? '—'}</td>
                  <td>{g.opening_name ?? '—'}</td>
                  <td>{g.eco_code ?? '—'}</td>
                  <td>
                    {g.opponent_deviation == null
                      ? <span className="muted">none</span>
                      : g.opponent_deviation ? 'Opponent deviated' : 'You deviated'}
                  </td>
                  <td>{g.move_number ?? '—'}</td>
                  <td>{g.move_uci ? <code>{g.move_uci}</code> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
