# chess-opening-analyzer

## Overview
Analyzes PGN files and detects when opponents deviate from a predefined opening repertoire.

## Features
- Builds opening tree in PostgreSQL
- Detects deviations move-by-move
- Tracks opponent vs player deviation
- Calculates win rates based on deviation timing

## Tech Stack
- Java
- PostgreSQL
- JDBC

## How to Run
2. Run BuildTreeMain
3. Upload Games to PGN folders
4. Run TestPGN
5. SELECT * FROM deviation_stats;

## Example Output
Move | Opponent Deviated | Games | Win Rate
2    | true              | 5     | 60%
3    | false             | 3     | 33%
