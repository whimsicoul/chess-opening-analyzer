# chess-opening-analyzer

## Overview
A Java-based data analysis system that processes chess PGN files to detect deviations from a predefined opening repertoire and compute outcome-based statistics.

This project demonstrates structured data ingestion, tree-based traversal, and relational database analytics using PostgreSQL.

---

## Features
- Builds and maintains an opening tree in PostgreSQL
- Detects deviations from theory move-by-move
- Identifies whether the **player or opponent** deviated
- Processes entire folders of PGN files automatically
- Computes win rates based on deviation timing

---

## Tech Stack
- Java
- PostgreSQL
- JDBC

---

## How It Works
1. Opening lines are stored as a tree structure in PostgreSQL
2. PGN files are parsed into move sequences
3. Each move is checked against the opening tree
4. The system detects the first deviation and records:
   - Move number
   - Who deviated (player vs opponent)
   - Position in the tree
5. Results are aggregated into statistics tables

---

## How to Run

1. Configure your PostgreSQL database connection by setting environment variables for `DB_URL`, `DB_USER`, and `DB_PASSWORD`.

2. Run `BuildTreeMain` to initialize the opening tree. You can optionally add custom opening lines using `RepertoireBuilder`.

3. Place your PGN files into the appropriate folders:  
   `/resources/pgn_files/white_games` or `/resources/pgn_files/black_games`.

4. Run `TestPGN` to process the games and detect deviations.

5. View the results by executing the SQL query:  
   `SELECT * FROM deviation_stats;`

## Future Improvements
- Export analytics to CSV
- Add visualization of opening tree
- Build a simple UI or dashboard
- Integrate external APIs (e.g., chess platforms)

---
