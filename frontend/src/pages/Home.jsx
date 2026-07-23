import { Link } from 'react-router-dom';
import './Home.css';

const FEATURES = [
  {
    num: '01',
    icon: '⬆',
    title: 'Upload Games',
    desc: 'Automatically build your repertoire.',
    link: '/upload',
    label: 'Upload',
  },
  {
    num: '02',
    icon: '◑',
    title: 'Opening Analytics',
    desc: 'See which openings are costing you games.',
    link: '/analytics',
    label: 'View Analytics',
  },
  {
    num: '03',
    icon: '♜',
    title: 'Improve Repertoire',
    desc: 'Patch the gaps with engine-backed moves.',
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
        <p className="hero-eyebrow">Opening Preparation Tool</p>
        <h1 className="hero-headline">
          <span className="hl hl-1">Know exactly where your</span>
          <span className="hl hl-4">prep ends.</span>
        </h1>
        <p className="hero-sub">
          Upload your games, see exactly where your opening play is weakest,
          and fix it by expanding your repertoire right where it broke down.
        </p>
      </section>

      <section className="features">
        <div className="features-grid">
          {FEATURES.map(f => (
            <Link to={f.link} key={f.title} className="feature-card">
              <span className="feature-num" aria-hidden="true">{f.num}</span>
              <div className="feature-body">
                <header className="feature-header">
                  <span className="feature-icon">{f.icon}</span>
                  <h3>{f.title}</h3>
                </header>
                <p>{f.desc}</p>
                <span className="feature-link">
                  {f.label}
                  <span className="feature-arrow" aria-hidden="true">→</span>
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Notation ticker — frames the bottom of the page */}
      <div className="notation-strip" aria-hidden="true">
        <div className="notation-inner">
          {NOTATION_MOVES.map((m, i) => <span key={i}>{m}</span>)}
          {NOTATION_MOVES.map((m, i) => <span key={`b${i}`}>{m}</span>)}
          {NOTATION_MOVES.map((m, i) => <span key={`c${i}`}>{m}</span>)}
        </div>
      </div>
    </main>
  );
}
