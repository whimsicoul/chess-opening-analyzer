import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './GuidanceModal.css';

const STEPS = [
  {
    icon: '♟',
    title: 'Welcome to OpeningAnalyzer',
    description:
      'This guide will walk you through each section of the app. Use the Next button to move through the pages — you\'ll be taken there automatically.',
    tip: 'You can reopen this guide at any time by clicking the ? button in the navigation bar.',
    route: null,
    selector: null,
  },
  {
    icon: '♔',
    title: 'The Repertoire Board',
    description:
      'This is the heart of the app. Drag pieces to play moves, or type them into the input below the board. Use the ← → buttons to navigate through your line, and Reset to start fresh.',
    tip: 'Try playing 1.e4 or 1.d4 as White to start exploring your first opening.',
    route: '/white-repertoire',
    selector: '.rep-input-board',
  },
  {
    icon: '🔍',
    title: 'Engine & Opening Book',
    description:
      'The right-hand panels update with every move. The Engine shows the top 3 computer evaluations. The Opening Book has two tabs — Masters (elite games) and Lichess (millions of online games). Click Play on any suggested move to try it.',
    tip: 'Switch to the Lichess tab to see what\'s most popular at your rating level.',
    route: '/white-repertoire',
    selector: '.book-panel',
  },
  {
    icon: '💾',
    title: 'Saving a Line',
    description:
      'Once you\'ve explored a line you want to keep, fill in the Opening Name and ECO Code fields here (they often auto-fill from the database). Then click Save Line to add it to your repertoire.',
    tip: 'You can save multiple variations from the same starting move — useful for covering different responses.',
    route: '/white-repertoire',
    selector: '.rep-meta-grid',
  },
  {
    icon: '🌳',
    title: 'Your Repertoire Tree',
    description:
      'The "Manage saved lines" section shows your full repertoire as a move tree. Click any move to instantly load that position on the board. Lines with a single child are shown inline; use the +/− buttons to expand branches.',
    tip: 'Click the − button next to any line to remove it from your repertoire.',
    route: '/white-repertoire',
    selector: 'details.tree-manage-lines',
    openDetails: true,
  },
  {
    icon: '📂',
    title: 'Games & Deviation Analysis',
    description:
      'Here you can fetch games directly from Lichess or Chess.com, or upload a PGN file. After importing, the analyzer checks each game against your saved repertoire and marks exactly where you went off-book.',
    tip: 'Click any game card to open an interactive board viewer and step through the moves.',
    route: '/games',
    selector: '.filter-card',
  },
  {
    icon: '📊',
    title: 'Analytics & Visualization',
    description:
      'The Analytics page shows your win rates broken down by opening line — green bars are your strong lines, amber and red show areas to study. Head to Visualization for an interactive sunburst chart of your full repertoire.',
    tip: 'Use the color toggle on the Visualization page to switch between your White and Black repertoires.',
    route: '/stats',
    selector: '.stats-grid',
  },
];

function clearHighlight() {
  document.querySelectorAll('.tour-target').forEach(el => el.classList.remove('tour-target'));
}

export default function GuidanceModal({ open, onClose }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  // Reset to step 0 when opened
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  // Navigate and highlight on step change
  useEffect(() => {
    if (!open) return;

    const current = STEPS[step];

    if (current.route) {
      navigate(current.route);
    }

    clearHighlight();

    if (!current.selector) return;

    // Delay to let the page render after navigation
    const timer = setTimeout(() => {
      const el = document.querySelector(current.selector);
      if (!el) return;

      if (current.openDetails && el.tagName === 'DETAILS') {
        el.open = true;
      }

      el.classList.add('tour-target');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 350);

    return () => clearTimeout(timer);
  }, [step, open, navigate]);

  // Clean up highlight when closed
  useEffect(() => {
    if (!open) clearHighlight();
  }, [open]);

  if (!open) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  return (
    <div className="guidance-panel" role="dialog" aria-modal="true" aria-label={current.title}>
      <div className="guidance-panel-header">
        <div className="guidance-panel-title-row">
          <span className="guidance-panel-icon">{current.icon}</span>
          <h2 className="guidance-panel-title">{current.title}</h2>
          <button className="guidance-close" onClick={onClose} aria-label="Close guide">✕</button>
        </div>
        <div className="guidance-step-track">
          {STEPS.map((_, i) => (
            <button
              key={i}
              className={`guidance-dot${i === step ? ' guidance-dot--active' : i < step ? ' guidance-dot--past' : ''}`}
              onClick={() => setStep(i)}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
          <span className="guidance-step-count">{step + 1} / {STEPS.length}</span>
        </div>
      </div>

      <div className="guidance-panel-body">
        <p className="guidance-description">{current.description}</p>
        {current.tip && (
          <div className="guidance-tip">
            <span className="guidance-tip-label">Tip</span>
            {current.tip}
          </div>
        )}
      </div>

      <div className="guidance-panel-footer">
        {!isLast && (
          <button className="guidance-skip-btn" onClick={onClose}>
            Skip tour
          </button>
        )}
        <div className="guidance-nav-buttons">
          {!isFirst && (
            <button className="btn btn-ghost guidance-back-btn" onClick={() => setStep(s => s - 1)}>
              ← Back
            </button>
          )}
          {isLast ? (
            <button className="btn guidance-next-btn" onClick={() => { navigate('/white-repertoire'); onClose(); }}>
              Get Started ✓
            </button>
          ) : (
            <button className="btn guidance-next-btn" onClick={() => setStep(s => s + 1)}>
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
