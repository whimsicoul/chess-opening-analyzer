import { Link } from 'react-router-dom';
import './Home.css';

const FEATURES = [
  {
    icon: '♜',
    title: 'Build Your Repertoire',
    desc: 'Add and manage your prepared opening lines with ECO codes and move trees.',
    link: '/repertoire',
    label: 'Open Repertoire',
  },
  {
    icon: '⬆',
    title: 'Upload Your Games',
    desc: 'Upload your games and instantly see the exact move where you or your opponent went off-book.',
    link: '/upload',
    label: 'Upload PGN',
  },
  {
    icon: '◑',
    title: 'Analytics',
    desc: 'Find trends in your opening play and see which lines you struggle with.',
    link: '/games',
    label: 'View Games',
  },
];

function HeroLogo() {
  return (
    <svg
      className="hero-logo"
      viewBox="-170 -160 340 260"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* ── Open book (background) ── */}
      <g opacity="1">
        {/* Left page */}
        <path
          d="M 0 -70 C -10 -75, -80 -72, -148 -48 L -148 68 C -80 48, -10 50, 0 48 Z"
          fill="rgba(14, 17, 30, 0.9)"
          stroke="rgba(201, 168, 76, 0.55)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Left page inner lines (ruled lines effect) */}
        <line x1="-120" y1="-28" x2="-14" y2="-24" stroke="rgba(201,168,76,0.22)" strokeWidth="1" />
        <line x1="-120" y1="-10" x2="-14" y2="-8"  stroke="rgba(201,168,76,0.22)" strokeWidth="1" />
        <line x1="-120" y1="8"   x2="-14" y2="8"   stroke="rgba(201,168,76,0.22)" strokeWidth="1" />
        <line x1="-120" y1="26"  x2="-14" y2="26"  stroke="rgba(201,168,76,0.22)" strokeWidth="1" />
        <line x1="-120" y1="44"  x2="-14" y2="44"  stroke="rgba(201,168,76,0.22)" strokeWidth="1" />

        {/* Right page */}
        <path
          d="M 0 -70 C 10 -75, 80 -72, 148 -48 L 148 68 C 80 48, 10 50, 0 48 Z"
          fill="rgba(14, 17, 30, 0.9)"
          stroke="rgba(201, 168, 76, 0.55)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Right page inner lines */}
        <line x1="120" y1="-28" x2="14" y2="-24" stroke="rgba(201,168,76,0.22)" strokeWidth="1" />
        <line x1="120" y1="-10" x2="14" y2="-8"  stroke="rgba(201,168,76,0.22)" strokeWidth="1" />
        <line x1="120" y1="8"   x2="14" y2="8"   stroke="rgba(201,168,76,0.22)" strokeWidth="1" />
        <line x1="120" y1="26"  x2="14" y2="26"  stroke="rgba(201,168,76,0.22)" strokeWidth="1" />
        <line x1="120" y1="44"  x2="14" y2="44"  stroke="rgba(201,168,76,0.22)" strokeWidth="1" />

        {/* Spine */}
        <path
          d="M 0 -75 C -5 -40, -5 20, 0 52 C 5 20, 5 -40, 0 -75 Z"
          fill="rgba(201, 168, 76, 0.35)"
          stroke="rgba(201, 168, 76, 0.65)"
          strokeWidth="1"
        />
      </g>

      {/* ── Chess king (foreground, centered) ── */}
      <g
        fill="rgba(201, 168, 76, 0.28)"
        stroke="rgba(201, 168, 76, 0.85)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {/* Base / skirt */}
        <path d="M -34 -72 L 34 -72 L 28 -96 L -28 -96 Z" />
        {/* Neck */}
        <path d="M -20 -96 L 20 -96 L 16 -116 L -16 -116 Z" />
        {/* Crown with three notches */}
        <path d="M -16 -116 L -16 -130 L -6 -122 L 0 -138 L 6 -122 L 16 -130 L 16 -116 Z" />
        {/* Cross vertical bar */}
        <rect x="-3.5" y="-158" width="7" height="22" rx="1" />
        {/* Cross horizontal bar */}
        <rect x="-13" y="-151" width="26" height="7" rx="1" />
        {/* Base platform */}
        <path d="M -38 -68 L 38 -68 L 38 -60 Q 0 -56, -38 -60 Z" />
      </g>
    </svg>
  );
}

export default function Home() {
  return (
    <main className="home">
      <section className="hero">
        <HeroLogo />
        <p className="hero-eyebrow">Opening Preparation Tool</p>
        <h1 className="hero-headline">
          Know exactly where<br />your prep ends
        </h1>
        <p className="hero-sub">
          Upload your games, compare them against your opening repertoire,
          and find the moves that took you off book.
        </p>
        <div className="hero-actions">
          <Link to="/upload" className="btn btn-primary">Upload Games</Link>
          <Link to="/repertoire" className="btn btn-outline">View Repertoire</Link>
        </div>
      </section>

      <section className="features">
        {FEATURES.map(f => (
          <div key={f.title} className="feature-card">
            <div className="feature-icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
            <Link to={f.link} className="feature-link">{f.label} →</Link>
          </div>
        ))}
      </section>
    </main>
  );
}
