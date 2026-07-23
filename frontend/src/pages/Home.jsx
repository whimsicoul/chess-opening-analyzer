import { Link } from 'react-router-dom';
import './Home.css';

const FEATURES = [
  {
    num: '01',
    icon: '⬆',
    title: 'Upload Your Games',
    desc: 'Upload your games and instantly see the exact move where you or your opponent went off-book.',
    link: '/upload',
    label: 'Upload PGN',
  },
  {
    num: '02',
    icon: '◑',
    title: 'Opening Analytics',
    desc: 'See your win/draw/loss rates and a Weakest Lines breakdown that surfaces exactly which openings are costing you games.',
    link: '/analytics',
    label: 'View Analytics',
  },
  {
    num: '03',
    icon: '♜',
    title: 'Shore Up Your Repertoire',
    desc: 'Click a weak line from Analytics to jump straight to it in your repertoire tree, then patch the gap with engine-backed moves.',
    link: '/repertoire',
    label: 'Open Repertoire',
  },
];

const NOTATION_MOVES = [
  '1.e4 e5', '2.Nf3 Nc6', '3.Bb5 a6', '4.Ba4 Nf6',
  '5.O-O Be7', '6.Re1 b5', '7.Bb3 d6', '8.c3 O-O',
  '9.h3 Na5', '10.Bc2 c5', '11.d4 Qc7', '12.Nbd2 cxd4',
];


export default function Home() {
  return (
    <main className="home">
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
              Upload your games, see exactly where your opening play is weakest,
              and fix it by expanding your repertoire right where it broke down.
            </p>
            <div className="hero-actions">
              <Link to="/upload" className="cta-primary">Upload Games</Link>
              <Link to="/analytics" className="cta-secondary">View Analytics</Link>
            </div>
          </div>

          <div className="hero-visual-reveal" aria-hidden="true">
            <div className="hero-visual">
              <div className="hero-logo-plate" />
              <img src="/new-final-logo.png" alt="" className="hero-logo" />
              <div className="hero-logo-glow" />
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
