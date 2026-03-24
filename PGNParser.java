package com.chessdata.sql;

import java.io.*;
import java.nio.file.*;
import java.sql.*;
import java.util.*;
import java.util.regex.*;

public class PGNParser {

    public static void main(String[] args) {
        String pgnDirectory = "src/main/resources/pgn_files/white_games";

        String url      = System.getenv().getOrDefault("DB_URL",  "jdbc:postgresql://localhost:5432/ChessOpenings");
        String user     = System.getenv().getOrDefault("DB_USER", "postgres");
        String password = System.getenv("DB_PASSWORD");

        try (Connection conn = DriverManager.getConnection(url, user, password)) {

            String createTableSQL = "CREATE TABLE IF NOT EXISTS pgn_games (" +
                    "id SERIAL PRIMARY KEY, " +
                    "opening_name VARCHAR(255), " +
                    "eco_code VARCHAR(10), " +
                    "result VARCHAR(10), " +
                    "pgn_data TEXT UNIQUE)";

            try (Statement stmt = conn.createStatement()) {
                stmt.execute(createTableSQL);
            }

            Files.walk(Paths.get(pgnDirectory))
                    .filter(Files::isRegularFile)
                    .forEach(pgnFilePath -> {
                        try {
                            String pgn = new String(Files.readAllBytes(pgnFilePath));

                            String openingName = extractOpeningName(pgn);
                            String ecoCode     = extractECOCode(pgn);
                            String result      = extractResult(pgn);

                            String checkSQL = "SELECT 1 FROM pgn_games WHERE pgn_data = ?";
                            try (PreparedStatement pstmtCheck = conn.prepareStatement(checkSQL)) {
                                pstmtCheck.setString(1, pgn);
                                try (ResultSet rs = pstmtCheck.executeQuery()) {
                                    if (!rs.next()) {
                                        String insertSQL = "INSERT INTO pgn_games (opening_name, eco_code, result, pgn_data) VALUES (?, ?, ?, ?)";
                                        try (PreparedStatement pstmtInsert = conn.prepareStatement(insertSQL)) {
                                            pstmtInsert.setString(1, openingName);
                                            pstmtInsert.setString(2, ecoCode);
                                            pstmtInsert.setString(3, result);
                                            pstmtInsert.setString(4, pgn);
                                            pstmtInsert.executeUpdate();
                                        }
                                    }
                                }
                            }
                        } catch (IOException | SQLException e) {
                            e.printStackTrace();
                        }
                    });

        } catch (SQLException | IOException e) {
            e.printStackTrace();
        }
    }

    // Parse a PGN string into a ParsedGame
    public ParsedGame parse(String pgn) {
        String openingName = extractOpeningName(pgn);
        String ecoCode     = extractECOCode(pgn);
        String result      = extractResult(pgn);
        String gameDate    = extractGameDate(pgn);
        List<String> moves = extractMoves(pgn);

        return new ParsedGame(openingName, ecoCode, result, gameDate, moves);
    }

    // Extract the move list from PGN text
    public static List<String> extractMoves(String pgn) {
        // Remove headers
        pgn = pgn.replaceAll("(?s)\\[.*?\\]", "");

        // Remove comments
        pgn = pgn.replaceAll("\\{[^}]*\\}", "");

        // IMPROVEMENT: handle nested variations by repeatedly stripping innermost parens
        // This correctly handles ((nested)) annotations that a single replaceAll misses
        String prev;
        do {
            prev = pgn;
            pgn  = pgn.replaceAll("\\([^()]*\\)", "");
        } while (!pgn.equals(prev));

        // Remove move numbers (handles "1." and "1..." for Black)
        pgn = pgn.replaceAll("\\d+\\.(\\.\\.)? *", "");

        // Remove results
        pgn = pgn.replaceAll("1-0|0-1|1/2-1/2|\\*", "");

        // Clean whitespace
        pgn = pgn.trim().replaceAll("\\s+", " ");

        if (pgn.isEmpty()) {
            return new ArrayList<>();
        }

        return new ArrayList<>(Arrays.asList(pgn.split(" ")));
    }

    // IMPROVEMENT: actually extract the Opening tag from the PGN header (was always returning "Unknown Opening")
    static String extractOpeningName(String pgn) {
        Pattern pattern = Pattern.compile("\\[Opening\\s+\"(.+?)\"\\]");
        Matcher matcher = pattern.matcher(pgn);
        if (matcher.find()) {
            return matcher.group(1);
        }
        // Fall back to ECO code if no Opening tag
        String eco = extractECOCode(pgn);
        return eco.equals("Unknown") ? "Unknown Opening" : "ECO " + eco;
    }

    static String extractECOCode(String pgn) {
        Pattern pattern = Pattern.compile("\\[ECO\\s+\"([A-Za-z0-9]+)\"\\]");
        Matcher matcher = pattern.matcher(pgn);
        if (matcher.find()) {
            return matcher.group(1);
        }
        return "Unknown";
    }

    static String extractResult(String pgn) {
        // Check the Result tag first for accuracy
        Pattern pattern = Pattern.compile("\\[Result\\s+\"(1-0|0-1|1/2-1/2|\\*)\"\\]");
        Matcher matcher = pattern.matcher(pgn);
        if (matcher.find()) {
            return matcher.group(1);
        }
        // Fallback: scan move text
        if (pgn.contains("1-0"))     return "1-0";
        if (pgn.contains("0-1"))     return "0-1";
        if (pgn.contains("1/2-1/2")) return "1/2-1/2";
        return "Unknown";
    }

    // IMPROVEMENT: extract game date from PGN header
    static String extractGameDate(String pgn) {
        Pattern pattern = Pattern.compile("\\[Date\\s+\"([^\"]+)\"\\]");
        Matcher matcher = pattern.matcher(pgn);
        if (matcher.find()) {
            return matcher.group(1);
        }
        return null;
    }
}
