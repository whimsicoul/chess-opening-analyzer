import { useState } from 'react';
import api from '../api';

export default function Upload() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setResult(null);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post('/games/upload', formData);
      setResult(res.data);
    } catch (e) {
      setError(e.response?.data?.detail ?? 'Upload failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <h1>Upload Game</h1>

      <form className="card" onSubmit={handleSubmit}>
        <h2>Select PGN File</h2>
        <div className="form-row">
          <input
            type="file"
            accept=".pgn,text/plain"
            onChange={e => setFile(e.target.files[0] ?? null)}
            required
          />
          <button type="submit" disabled={loading || !file}>
            {loading ? 'Analyzing…' : 'Upload & Analyze'}
          </button>
        </div>
      </form>

      {error && <p className="error">{error}</p>}

      {result && (
        <div className="card result">
          <h2>Result</h2>
          <p><strong>Game ID:</strong> {result.game_id}</p>
          {result.deviation_move_number == null ? (
            <p className="muted">No deviation detected — game stayed within your repertoire.</p>
          ) : (
            <>
              <p>
                <strong>Deviated by:</strong>{' '}
                <span className="badge">{result.deviated_by}</span>
              </p>
              <p><strong>On move:</strong> {result.deviation_move_number}</p>
              <p>
                <strong>Move played:</strong> <code>{result.game_move}</code>
              </p>
              {result.expected_moves?.length > 0 && (
                <p>
                  <strong>Expected:</strong>{' '}
                  {result.expected_moves.map(m => (
                    <code key={m} style={{ marginRight: '0.4rem' }}>{m}</code>
                  ))}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </main>
  );
}
