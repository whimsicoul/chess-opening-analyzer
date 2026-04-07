import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboarding } from '../context/OnboardingContext';
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
    title: 'Build Your White Repertoire',
    description:
      'This is the heart of the app. Drag pieces to play moves, or type them into the input below the board. Use the ← → buttons to navigate through your line, and Reset to start fresh.',
    tip: 'Try playing 1.e4 or 1.d4 as White to start exploring your first opening.',
    route: '/white-repertoire',
    selector: '.rep-input-board',
    requiresWizard: 'white',
  },
  {
    icon: '♚',
    title: 'Build Your Black Repertoire',
    description:
      'Set up your opening lines for Black. Just like White, you can explore lines in response to 1.e4, 1.d4, and other first moves.',
    tip: 'Common Black responses include the Sicilian (1...c5) vs 1.e4 and the Nimzo-Indian (1...Nf6) vs 1.d4.',
    route: '/black-repertoire',
    selector: '.rep-input-board',
    requiresWizard: 'black',
  },
  {
    icon: '📂',
    title: 'Fetch Your Games',
    description:
      'Here you can fetch games directly from Lichess or Chess.com, or upload a PGN file. After importing, the analyzer checks each game against your saved repertoire and marks exactly where you went off-book.',
    tip: 'You\'ll need to enter your username and choose your source platform.',
    route: '/games',
    selector: '.filter-card',
    requiresWizard: 'games',
  },
  {
    icon: '📊',
    title: 'Analytics',
    description:
      'The Analytics page shows your win rates broken down by opening line — green bars are your strong lines, amber and red show areas to study.',
    tip: 'Revisit this page once you\'ve uploaded some games to see your opening performance.',
    route: '/stats',
    selector: '.stats-grid',
  },
  {
    icon: '◑',
    title: 'Visualization',
    description:
      'Head here for an interactive sunburst chart of your full repertoire. Each segment represents one of your saved lines.',
    tip: 'Use the color toggle to switch between your White and Black repertoires.',
    route: '/visualization',
    selector: 'svg',
  },
  {
    icon: '⚙',
    title: 'Settings',
    description:
      'Manage your account settings, change your password, or sign out here.',
    tip: 'Come back to settings anytime you need to update your profile.',
    route: '/settings',
    selector: '.settings-container',
  },
  {
    icon: '✓',
    title: 'You\'re all set!',
    description:
      'You\'ve learned the essentials. The ? button in the top right will always bring you back to this guide.',
    tip: 'Start by building your White repertoire, then add your games to begin tracking your opening performance.',
    route: '/',
    selector: '.navbar-help',
  },
];

function clearHighlight() {
  document.querySelectorAll('.tour-target').forEach(el => el.classList.remove('tour-target'));
}

export default function GuidanceModal({ open, onClose }) {
  const navigate = useNavigate();
  const { tourStep, advanceTour, backTour, wizardWhiteDone, wizardBlackDone, wizardGamesDone, completeTour, skipTour } = useOnboarding();

  // Listen for wizard completion events
  useEffect(() => {
    const handleWizardComplete = (e) => {
      const current = STEPS[tourStep];
      if (current.requiresWizard === e.detail) {
        advanceTour();
      }
    };

    if (open) {
      window.addEventListener('wizard-complete', handleWizardComplete);
      return () => window.removeEventListener('wizard-complete', handleWizardComplete);
    }
  }, [open, tourStep, advanceTour]);

  // Navigate and highlight on step change
  useEffect(() => {
    if (!open) return;

    const current = STEPS[tourStep];

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
  }, [tourStep, open, navigate]);

  // Clean up highlight when closed
  useEffect(() => {
    if (!open) clearHighlight();
  }, [open]);

  if (!open) return null;

  const current = STEPS[tourStep];
  const isLast = tourStep === STEPS.length - 1;
  const isFirst = tourStep === 0;

  // Determine if a wizard is required and whether it's complete
  let wizardPending = false;
  if (current.requiresWizard === 'white') {
    wizardPending = !wizardWhiteDone;
  } else if (current.requiresWizard === 'black') {
    wizardPending = !wizardBlackDone;
  } else if (current.requiresWizard === 'games') {
    wizardPending = !wizardGamesDone;
  }

  return (
    <div className="guidance-panel" role="dialog" aria-modal="true" aria-label={current.title}>
      <div className="guidance-panel-header">
        <div className="guidance-panel-title-row">
          <span className="guidance-panel-icon">{current.icon}</span>
          <h2 className="guidance-panel-title">{current.title}</h2>
          <button className="guidance-close" onClick={onClose} aria-label="Close guide">✕</button>
        </div>
        <div className="guidance-step-track">
          {STEPS.map((s, i) => {
            // Determine if this dot should be locked
            let isLocked = false;
            if (s.requiresWizard === 'white') isLocked = !wizardWhiteDone;
            else if (s.requiresWizard === 'black') isLocked = !wizardBlackDone;
            else if (s.requiresWizard === 'games') isLocked = !wizardGamesDone;

            return (
              <button
                key={i}
                className={`guidance-dot${i === tourStep ? ' guidance-dot--active' : i < tourStep ? ' guidance-dot--past' : ''}${isLocked ? ' guidance-dot--locked' : ''}`}
                disabled={isLocked || i > tourStep}
                aria-label={`Go to step ${i + 1}`}
              />
            );
          })}
          <span className="guidance-step-count">{tourStep + 1} / {STEPS.length}</span>
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
          <button className="guidance-skip-btn" onClick={() => { skipTour(); onClose(); }}>
            Skip tour
          </button>
        )}
        <div className="guidance-nav-buttons">
          {!isFirst && (
            <button className="btn btn-ghost guidance-back-btn" onClick={() => backTour && backTour()}>
              ← Back
            </button>
          )}
          {isLast ? (
            <button className="btn guidance-next-btn" onClick={() => { completeTour(); navigate('/'); }}>
              Done — Start Exploring ✓
            </button>
          ) : wizardPending ? (
            <div className="guidance-wizard-pending">
              <button className="btn guidance-next-btn" disabled>
                Complete the wizard above ↑
              </button>
            </div>
          ) : (
            <button className="btn guidance-next-btn" onClick={() => advanceTour && advanceTour()}>
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
