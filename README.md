# chess-opening-analyzer
# Chess Opening Deviation Analyzer

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
1. Set DB credentials (environment variable recommended)
2. Run BuildTreeMain
3. Run TestSinglePGN

## Example Output
Opponent deviated at move: 2
Win rate after deviation: 63%
