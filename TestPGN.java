package com.chessdata.sql;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.List;
import java.io.File;
import java.nio.file.Files;

public class TestPGN {

    private PGNParser parser = new PGNParser();
    private DeviationDetector detector;
    private Connection conn;
    private String deviationsTable;

    public TestPGN() {
        this(true);
    }

    public TestPGN(boolean playingAsWhite) {
        try {
            // FIX: all three DB params from env vars (was hardcoding url + user)
            String url      = System.getenv().getOrDefault("DB_URL",  "jdbc:postgresql://localhost:5432/ChessOpenings");
            String user     = System.getenv().getOrDefault("DB_USER", "postgres");
            String password = System.getenv("DB_PASSWORD");

            if (password == null) {
                throw new RuntimeException("DB_PASSWORD environment variable not set");
            }

            conn             = DriverManager.getConnection(url, user, password);
            detector         = new DeviationDetector(conn, playingAsWhite);
            deviationsTable  = playingAsWhite ? "game_deviations" : "black_game_deviations";

        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    // Process entire folder
    public void processPGNFolder(String folderPath) {
        File folder = new File(folderPath);
        File[] files = folder.listFiles((dir, name) -> name.toLowerCase().endsWith(".pgn"));

        if (files == null || files.length == 0) {
            System.out.println("No PGN files found in: " + folderPath);
            return;
        }

        for (File file : files) {
            try {
                System.out.println("Processing: " + file.getName());
                String pgn = Files.readString(file.toPath());
                processSingleGame(pgn);
            } catch (Exception e) {
                System.out.println("Error reading file: " + file.getName());
                e.printStackTrace();
            }
        }

        // IMPROVEMENT: refresh materialized view after all games are processed
        refreshDeviationStats();
    }

    // IMPROVEMENT: games table now stores eco_code, opening_name, game_date
    private int saveGame(ParsedGame game) {
        String sql = "INSERT INTO games (result, eco_code, opening_name, game_date) " +
                     "VALUES (?, ?, ?, ?) RETURNING id";

        try (PreparedStatement pstmt = conn.prepareStatement(sql)) {
            pstmt.setString(1, game.getResult());
            pstmt.setString(2, game.getEcoCode());
            pstmt.setString(3, game.getOpeningName());
            pstmt.setString(4, game.getGameDate());

            try (ResultSet rs = pstmt.executeQuery()) {
                if (rs.next()) {
                    int gameId = rs.getInt(1);
                    System.out.println("Saved game with ID: " + gameId);
                    return gameId;
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return -1;
    }

    private void processSingleGame(String pgn) {
        ParsedGame game    = parser.parse(pgn);
        List<String> moves = game.getSanMoves();

        System.out.println("Moves: " + moves);

        int gameId = saveGame(game);
        if (gameId == -1) {
            System.out.println("Failed to save game.");
            return;
        }

        DeviationResult deviation = detector.findDeviation(moves);

        if (deviation != null) {
            if (deviation.isOpponentDeviation()) {
                System.out.println("Opponent deviated at move: " + deviation.getMoveNumber());
            } else {
                System.out.println("You deviated at move: " + deviation.getMoveNumber());
            }
            saveDeviation(gameId, deviation);
        } else {
            System.out.println("No deviation detected — game followed repertoire fully.");
        }
    }

    // BUG FIX: opponent_deviation column is now written
    private void saveDeviation(int gameId, DeviationResult d) {
        String sql = "INSERT INTO " + deviationsTable + " " +
                "(game_id, move_number, move_san, position_id, deviation_depth, " +
                " line_depth, completion_percentage, opponent_deviation) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)";

        try (PreparedStatement pstmt = conn.prepareStatement(sql)) {
            pstmt.setInt(1,     gameId);
            pstmt.setInt(2,     d.getMoveNumber());
            pstmt.setString(3,  d.getMoveSan());
            pstmt.setInt(4,     d.getPositionId());
            pstmt.setInt(5,     d.getDeviationDepth());
            pstmt.setInt(6,     d.getLineDepth());
            pstmt.setDouble(7,  d.getCompletionPercentage());
            pstmt.setBoolean(8, d.isOpponentDeviation()); // BUG FIX: was missing
            pstmt.executeUpdate();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    // IMPROVEMENT: auto-refresh materialized view so deviation_stats is always current
    private void refreshDeviationStats() {
        try (Statement stmt = conn.createStatement()) {
            stmt.execute("REFRESH MATERIALIZED VIEW deviation_stats");
            System.out.println("deviation_stats refreshed.");
        } catch (Exception e) {
            System.out.println("Could not refresh deviation_stats: " + e.getMessage());
        }
    }

    public static void main(String[] args) {
        boolean playingAsWhite = true;
        String folder = null;

        for (String arg : args) {
            if (arg.equals("--black")) {
                playingAsWhite = false;
            } else {
                folder = arg;
            }
        }

        if (folder == null) {
            folder = playingAsWhite
                ? "src/main/resources/pgn_files/white_games"
                : "src/main/resources/pgn_files/black_games";
        }

        TestPGN test = new TestPGN(playingAsWhite);
        test.processPGNFolder(folder);
    }
}
