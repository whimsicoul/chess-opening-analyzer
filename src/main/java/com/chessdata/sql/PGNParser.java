package com.chessdata.sql;

import java.io.*;
import java.nio.file.*;
import java.sql.*;
import java.util.*;
import java.util.regex.*;

public class PGNParser {

    // =========================
    // MAIN (UNCHANGED LOGIC)
    // =========================
    public static void main(String[] args) {
        String pgnDirectory = "src/main/resources/pgn_files/white_games";

        String url = "jdbc:postgresql://localhost:5432/ChessOpenings";
        String user = "postgres";
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
                            String ecoCode = extractECOCode(pgn);
                            String result = extractResult(pgn);

                            String checkSQL = "SELECT 1 FROM pgn_games WHERE pgn_data = ?";
                            try (PreparedStatement pstmtCheck = conn.prepareStatement(checkSQL)) {
                                pstmtCheck.setString(1, pgn);
                                ResultSet rs = pstmtCheck.executeQuery();

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

                        } catch (IOException | SQLException e) {
                            e.printStackTrace();
                        }
                    });

        } catch (SQLException | IOException e) {
            e.printStackTrace();
        }
    }

    // =========================
    // NEW: PARSE METHOD
    // =========================
    public ParsedGame parse(String pgn) {
        String openingName = extractOpeningName(pgn);
        String ecoCode = extractECOCode(pgn);
        String result = extractResult(pgn);

        List<String> moves = extractMoves(pgn);

        return new ParsedGame(openingName, ecoCode, result, moves);
    }

    // =========================
    // NEW: MOVE EXTRACTION
    // =========================
    public static List<String> extractMoves(String pgn) {
        // Remove headers
        pgn = pgn.replaceAll("(?s)\\[.*?\\]", "");

        // Remove comments
        pgn = pgn.replaceAll("\\{.*?\\}", "");

        // Remove variations
        pgn = pgn.replaceAll("\\(.*?\\)", "");

        // Remove move numbers (1. 2... etc)
        pgn = pgn.replaceAll("\\d+\\.(\\.\\.)?", "");

        // Remove results
        pgn = pgn.replaceAll("1-0|0-1|1/2-1/2|\\*", "");

        // Clean whitespace
        pgn = pgn.trim().replaceAll("\\s+", " ");

        if (pgn.isEmpty()) {
            return new ArrayList<>();
        }

        String[] movesArray = pgn.split(" ");
        return new ArrayList<>(Arrays.asList(movesArray));
    }

    // =========================
    // EXISTING METHODS (UNCHANGED)
    // =========================

    private static String extractOpeningName(String pgn) {
        return "Unknown Opening"; // placeholder
    }

    private static String extractECOCode(String pgn) {
        Pattern ecoPattern = Pattern.compile("\\[ECO\\s+\"([A-Za-z0-9]+)\"\\]");
        Matcher matcher = ecoPattern.matcher(pgn);
        if (matcher.find()) {
            return matcher.group(1);
        }
        return "Unknown";
    }

    private static String extractResult(String pgn) {
        if (pgn.contains("1-0")) {
            return "1-0";
        } else if (pgn.contains("0-1")) {
            return "0-1";
        } else if (pgn.contains("1/2-1/2")) {
            return "1/2-1/2";
        }
        return "Unknown";
    }
}