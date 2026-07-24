import { useEffect, useState } from 'react';
import api from '../api';

const STRUCTURE_LABELS = {
  carlsbad: 'Carlsbad structure',
  isolated_queens_pawn_white: "Isolated Queen's Pawn (White)",
  isolated_queens_pawn_black: "Isolated Queen's Pawn (Black)",
  stonewall_white: 'Stonewall (White)',
  stonewall_black: 'Stonewall (Black)',
  hedgehog_white: 'Hedgehog (White)',
  hedgehog_black: 'Hedgehog (Black)',
  hanging_pawns_white: 'Hanging pawns (White)',
  hanging_pawns_black: 'Hanging pawns (Black)',
  closed_center: 'Closed center',
};

function fileList(files) {
  return files && files.length ? files.join(', ') : null;
}

// Stats/structure/plans panel for the position currently on the board —
// three visually distinct sections (stats / structural facts / plans) per
// their different reliability, not blended into one narrative.
export default function MotifPanel({ fen, color, sanPath }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!fen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.get('/motifs', { params: { fen, color, path: sanPath.join(' ') } })
      .then(res => { if (!cancelled) setData(res.data); })
      .catch(() => { if (!cancelled) setError('Could not load ideas for this position'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fen, color, sanPath.join(' ')]);

  const stats = data?.your_stats;
  const structure = data?.structure;
  const plans = data?.plans ?? [];
  const citations = data?.source_citations ?? [];

  const structureLabel = structure?.pawn_structure
    ? (STRUCTURE_LABELS[structure.pawn_structure] ?? structure.pawn_structure)
    : null;

  return (
    <div className="motif-panel">
      <div className="motif-section motif-section--stats">
        <div className="motif-section-title">Your stats</div>
        {loading && !data && <p className="engine-empty muted">Loading…</p>}
        {error && <p className="engine-empty muted">{error}</p>}
        {!loading && !error && !stats && (
          <p className="engine-empty muted">No games reach this position yet</p>
        )}
        {stats && (
          <p className="motif-stats-line">
            You've reached this position {stats.total} time{stats.total === 1 ? '' : 's'}.
            {stats.move_san && (
              <> You play <strong>{stats.move_san}</strong> ({stats.winRate.toFixed(0)}% win rate)</>
            )}
            {stats.main_line_move && (
              <>, main line is <strong>{stats.main_line_move}</strong></>
            )}
            .
          </p>
        )}
      </div>

      <div className="motif-section motif-section--structure">
        <div className="motif-section-title">Structural facts</div>
        {!loading && structure && (
          <ul className="motif-fact-list">
            {structureLabel && <li>{structureLabel}</li>}
            {fileList(structure.open_files) && (
              <li>Open file{structure.open_files.length > 1 ? 's' : ''}: {fileList(structure.open_files)}</li>
            )}
            {fileList(structure.semi_open_files?.white) && (
              <li>Semi-open for White: {fileList(structure.semi_open_files.white)}-file</li>
            )}
            {fileList(structure.semi_open_files?.black) && (
              <li>Semi-open for Black: {fileList(structure.semi_open_files.black)}-file</li>
            )}
            {structure.outposts?.map((o, i) => (
              <li key={i}>{o.square} is a long-term outpost for {o.side}</li>
            ))}
            {!structureLabel && !fileList(structure.open_files) &&
              !fileList(structure.semi_open_files?.white) && !fileList(structure.semi_open_files?.black) &&
              !structure.outposts?.length && (
                <li className="muted">No distinctive structural features yet</li>
            )}
          </ul>
        )}
      </div>

      <div className="motif-section motif-section--plans">
        <div className="motif-section-title">Plans</div>
        {!loading && plans.length === 0 && (
          <p className="engine-empty muted">No plan summary available for this line yet</p>
        )}
        {plans.map((p, i) => (
          <div key={i} className="motif-plan-block">
            <div className="motif-plan-side">{p.side === 'white' ? 'White' : 'Black'}</div>
            <ul className="motif-fact-list">
              {p.bullets.map((b, j) => <li key={j}>{b}</li>)}
            </ul>
          </div>
        ))}
        {citations.length > 0 && (
          <p className="motif-citation muted">
            Ideas from{' '}
            {citations.map((c, i) => (
              <span key={i}>
                <a href={c.url} target="_blank" rel="noreferrer">{c.title}</a>
                {i < citations.length - 1 ? ', ' : ''}
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}
