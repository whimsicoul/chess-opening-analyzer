import { useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { useOnboarding } from '../context/OnboardingContext';
import './Home.css';

const FEATURES = [
  {
    num: '01',
    icon: '♜',
    title: 'Build Your Repertoire',
    desc: 'Add and manage your prepared opening lines with ECO codes and move trees.',
    link: '/repertoire',
    label: 'Open Repertoire',
  },
  {
    num: '02',
    icon: '⬆',
    title: 'Upload Your Games',
    desc: 'Upload your games and instantly see the exact move where you or your opponent went off-book.',
    link: '/upload',
    label: 'Upload PGN',
  },
  {
    num: '03',
    icon: '◑',
    title: 'Opening Analytics',
    desc: 'Find trends in your opening play and see which lines you struggle with most.',
    link: '/games',
    label: 'View Games',
  },
];

const NOTATION_MOVES = [
  '1.e4 e5', '2.Nf3 Nc6', '3.Bb5 a6', '4.Ba4 Nf6',
  '5.O-O Be7', '6.Re1 b5', '7.Bb3 d6', '8.c3 O-O',
  '9.h3 Na5', '10.Bc2 c5', '11.d4 Qc7', '12.Nbd2 cxd4',
];


function NewUserWelcomeBanner({ onStartTour, onSkip, isExiting }) {
  return (
    <section className={`welcome-banner ${isExiting ? 'welcome-banner--exit' : ''}`}>
      <div className="welcome-banner-content">
        <div className="welcome-banner-text">
          <h2>Welcome to OpeningAnalyzer</h2>
          <p>Let's get you set up in about 5 minutes with a guided tour!</p>
        </div>
        <div className="welcome-banner-actions">
          <button className="btn btn-large" onClick={onStartTour}>
            Start the Tour
          </button>
          <button className="btn-link" onClick={onSkip}>
            Skip, I'll explore myself
          </button>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const { isAuthenticated } = useContext(AuthContext);
  const { startTour, skipTour, onboardingComplete, tourActive } = useOnboarding();
  const [bannerExiting, setBannerExiting] = useState(false);
  const showWelcomeBanner = isAuthenticated && !onboardingComplete && !tourActive && !bannerExiting;

  const handleSkipTour = () => {
    setBannerExiting(true);
    setTimeout(() => {
      skipTour();
    }, 600);
  };

  return (
    <main className="home">
      {showWelcomeBanner && (
        <NewUserWelcomeBanner onStartTour={startTour} onSkip={handleSkipTour} isExiting={bannerExiting} />
      )}
      <section className="hero">
        <div className="hero-content">
          <div className="hero-text">
            <p className="hero-eyebrow">Opening Preparation Tool</p>
            <h1 className="hero-headline">
              <span className="hl hl-1">Know</span>
              <span className="hl hl-2">exactly</span>
              <span className="hl hl-3">where your</span>
              <span className="hl hl-4">prep ends.</span>
            </h1>
            <p className="hero-sub">
              Upload your games, compare them against your opening repertoire,
              and find the moves that took you off book.
            </p>
            <div className="hero-actions">
              <Link to="/upload" className="cta-primary">Upload Games</Link>
              <Link to="/repertoire" className="cta-secondary">View Repertoire</Link>
            </div>
          </div>

          <div className="hero-visual-reveal" aria-hidden="true">
            <div className="hero-visual">
              <div className="hero-logo-plate" />
              <img src="/final-logo.png" alt="" className="hero-logo" />
            </div>
          </div>
        </div>

        {/* Notation ticker */}
        <div className="notation-strip" aria-hidden="true">
          <div className="notation-inner">
            {NOTATION_MOVES.map((m, i) => <span key={i}>{m}</span>)}
            {NOTATION_MOVES.map((m, i) => <span key={`b${i}`}>{m}</span>)}
            {NOTATION_MOVES.map((m, i) => <span key={`c${i}`}>{m}</span>)}
          </div>
        </div>
      </section>

      <section className="features">
        <div className="section-label">
          <span>What it does</span>
        </div>
        <div className="features-grid">
          {FEATURES.map(f => (
            <article key={f.title} className="feature-card">
              <span className="feature-num" aria-hidden="true">{f.num}</span>
              <div className="feature-body">
                <header className="feature-header">
                  <span className="feature-icon">{f.icon}</span>
                  <h3>{f.title}</h3>
                </header>
                <p>{f.desc}</p>
                <Link to={f.link} className="feature-link">
                  {f.label}
                  <span className="feature-arrow" aria-hidden="true">→</span>
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
