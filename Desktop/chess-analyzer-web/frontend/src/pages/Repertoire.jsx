import { useEffect, useState } from 'react';
import api from '../api';

export default function Repertoire() {
  const [lines, setLines] = useState([]);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ move_san: '', opening_name: '', eco_code: '' });
  const [submitting, setSubmitting] = useState(false);

  async function fetchLines() {
    try {
      const res = await api.get('/openings/');
      setLines(res.data);
    } catch (e) {
      setError('Failed to load openings.');
    }
  }

  useEffect(() => { fetchLines(); }, []);

  async function handleAdd(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/openings/', form);
      setForm({ move_san: '', opening_name: '', eco_code: '' });
      await fetchLines();
    } catch (e) {
      setError('Failed to add opening line.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/openings/${id}`);
      setLines(prev => prev.filter(l => l.id !== id));
    } catch (e) {
      setError('Failed to delete opening line.');
    }
  }

  return (
    <main className="page">
      <h1>Repertoire</h1>

      <form className="card" onSubmit={handleAdd}>
        <h2>Add Opening Line</h2>
        <div className="form-row">
          <input
            placeholder="Move (SAN) e.g. e4"
            value={form.move_san}
            onChange={e => setForm(f => ({ ...f, move_san: e.target.value }))}
            required
          />
          <input
            placeholder="Opening name"
            value={form.opening_name}
            onChange={e => setForm(f => ({ ...f, opening_name: e.target.value }))}
          />
          <input
            placeholder="ECO code e.g. B20"
            value={form.eco_code}
            onChange={e => setForm(f => ({ ...f, eco_code: e.target.value }))}
          />
          <button type="submit" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add'}
          </button>
        </div>
      </form>

      {error && <p className="error">{error}</p>}

      <div className="card">
        <h2>Opening Lines</h2>
        {lines.length === 0 ? (
          <p className="muted">No lines in repertoire yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Move</th>
                <th>Opening</th>
                <th>ECO</th>
                <th>Parent ID</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map(line => (
                <tr key={line.id}>
                  <td>{line.id}</td>
                  <td><code>{line.move_san}</code></td>
                  <td>{line.opening_name ?? '—'}</td>
                  <td>{line.eco_code ?? '—'}</td>
                  <td>{line.parent_id}</td>
                  <td>
                    <button className="btn-delete" onClick={() => handleDelete(line.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
