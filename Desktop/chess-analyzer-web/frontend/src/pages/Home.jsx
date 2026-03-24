export default function Home() {
  return (
    <main className="page">
      <h1>Chess Opening Analyzer</h1>
      <p>
        Build your opening repertoire, upload PGN games, and instantly see
        where you or your opponent deviated from your prepared lines.
      </p>
      <ul>
        <li><strong>Repertoire</strong> — view, add, and delete opening lines</li>
        <li><strong>Upload</strong> — analyze a PGN game against your repertoire</li>
        <li><strong>Games</strong> — browse all previously analyzed games</li>
      </ul>
    </main>
  );
}
