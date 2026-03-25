import { useState, useRef } from 'react';
import api from '../api';
import ChessBoardViewer from '../components/ChessBoardViewer';
import './Upload.css';

// Convert backend deviation_move_number + deviated_by into a positions-array index
function toHighlightIndex(moveNumber, deviatedBy) {
  if (moveNumber == null || deviatedBy == null) return null;
  return (moveNumber - 1) * 2 + (deviatedBy === 'black' ? 2 : 1);
}

export default function Upload() {
  const [file, setFile]       = useState(null);
  const [pgnText, setPgnText] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  function pickFile(f) {
    if (f && (f.name.endsWith('.pgn') || f.type === 'text/plain')) {
      setFile(f);
      setResult(null);
      setError(null);
      setPgnText(null);
      f.text().then(t => setPgnText(t));
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    pickFile(e.dataTransfer.files[0]);
  }

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

  const noDeviation = result && result.deviation_move_number == null;
  const opponentDev = result && result.deviated_by === 'black';
  const youDev      = result && result.deviated_by === 'white';

  const highlightIndex = result ? toHighlightIndex(result.deviation_move_number, result.deviated_by) : null;
  const deviationColor = opponentDev ? 'amber' : 'red';
  const deviationLabel = result && !noDeviation
    ? `${opponentDev ? 'Opponent deviated' : 'You deviated'} on move ${result.deviation_move_number}: ${result.game_move}`
    : null;

  return (
    <main className="page">
      <div className="page-header">
        <h1>Upload Game</h1>
        <p>Analyze a PGN file against your opening repertoire</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div
          className={`dropzone ${dragging ? 'dropzone-active' : ''} ${file ? 'dropzone-ready' : ''}`}
          onClick={() => inputRef.current.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pgn,text/plain"
            style={{ display: 'none' }}
            onChange={e => pickFile(e.target.files[0])}
          />
          <div className="dropzone-icon">{file ? '✓' : '⬆'}</div>
          {file ? (
            <>
              <p className="dropzone-filename">{file.name}</p>
              <p className="dropzone-hint">Click to choose a different file</p>
            </>
          ) : (
            <>
              <p className="dropzone-text">Drop your PGN file here</p>
              <p className="dropzone-hint">or click to browse</p>
            </>
          )}
        </div>

        <button
          className="btn upload-btn"
          type="submit"
          disabled={loading || !file}
        >
          {loading ? 'Analyzing…' : 'Analyze Game'}
        </button>
      </form>

      {error && <div className="msg-error">⚠ {error}</div>}

      {result && (
        <div className={`result-card ${noDeviation ? 'result-green' : opponentDev ? 'result-amber' : 'result-red'}`}>
          <div className="result-card-header">
            <span className={`badge ${noDeviation ? 'badge-green' : opponentDev ? 'badge-amber' : 'badge-red'}`}>
              {noDeviation ? '✓ In Repertoire' : opponentDev ? '⚡ Opponent Deviated' : '✕ You Deviated'}
            </span>
            <span className="result-game-id muted">Game #{result.game_id}</span>
          </div>

          {noDeviation ? (
            <p className="result-clean-msg">
              The game stayed within your prepared lines the entire way.
            </p>
          ) : (
            <div className="result-row">
              <div className="result-field">
                <span className="result-field-label">Deviated by</span>
                <span className="result-field-value" style={{ textTransform: 'capitalize' }}>
                  {result.deviated_by}
                </span>
              </div>
              <div className="result-field">
                <span className="result-field-label">On move</span>
                <span className="result-field-value">{result.deviation_move_number}</span>
              </div>
              <div className="result-field">
                <span className="result-field-label">Move played</span>
                <code style={{ fontSize: '1rem' }}>{result.game_move}</code>
              </div>
              {result.expected_moves?.length > 0 && (
                <div className="result-field">
                  <span className="result-field-label">Expected</span>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.15rem' }}>
                    {result.expected_moves.map(m => <code key={m}>{m}</code>)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {result && pgnText && (
        <ChessBoardViewer
          pgn={pgnText}
          highlightIndex={highlightIndex}
          deviationColor={deviationColor}
          deviationLabel={deviationLabel}
        />
      )}
    </main>
  );
}
