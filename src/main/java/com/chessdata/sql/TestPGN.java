package com.chessdata.sql;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.List;
import java.io.File;
import java.nio.file.Files;

public class TestPGN {

    private PGNParser parser = new PGNParser();
    private DeviationDetector detector;

    private Connection conn;

    public TestPGN() {
        try {
            String url = "jdbc:postgresql://localhost:5432/ChessOpenings";
            String user = "postgres";
            String password = System.getenv("DB_PASSWORD");
            conn = DriverManager.getConnection(url, user, password);

            detector = new DeviationDetector(conn);

        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    // ✅ Process entire folder
    public void processPGNFolder(String folderPath) {

        File folder = new File(folderPath);

        File[] files = folder.listFiles((dir, name) -> name.toLowerCase().endsWith(".pgn"));

        if (files == null || files.length == 0) {
            System.out.println("No PGN files found.");
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
    }

    // ✅ Save game FIRST
    private int saveGame(ParsedGame game) {

        String sql = "INSERT INTO games (result) VALUES (?) RETURNING id";

        try (PreparedStatement pstmt = conn.prepareStatement(sql)) {

            pstmt.setString(1, game.getResult());

            ResultSet rs = pstmt.executeQuery();

            if (rs.next()) {
                int gameId = rs.getInt(1);
                System.out.println("Saved game with ID: " + gameId);
                return gameId;
            }

        } catch (Exception e) {
            e.printStackTrace();
        }

        return -1;
    }

    // ✅ Process one game
    private void processSingleGame(String pgn) {

        ParsedGame game = parser.parse(pgn);

        List<String> sanMoves = game.getSanMoves();

        System.out.println("Moves: " + sanMoves);

        // ✅ Save game FIRST
        int gameId = saveGame(game);

        if (gameId == -1) {
            System.out.println("Failed to save game.");
            return;
        }

        DeviationResult deviation = detector.findDeviation(sanMoves);

        if (deviation != null) {

            if (deviation.isOpponentDeviation()) {
                System.out.println("Opponent deviated at move: " + deviation.getMoveNumber());
            } else {
                System.out.println("You deviated at move: " + deviation.getMoveNumber());
            }

            saveDeviation(gameId, deviation);
        }
    }

    // ✅ Save deviation (FIXED indexing)
    private void saveDeviation(int gameId, DeviationResult d) {

        String sql = "INSERT INTO game_deviations " +
                "(game_id, move_number, move_uci, position_id, deviation_depth, line_depth, completion_percentage) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?)";

        try (PreparedStatement pstmt = conn.prepareStatement(sql)) {

            pstmt.setInt(1, gameId);
            pstmt.setInt(2, d.getMoveNumber());
            pstmt.setString(3, d.getMoveUci());
            pstmt.setInt(4, d.getPositionId());
            pstmt.setInt(5, d.getDeviationDepth());
            pstmt.setInt(6, d.getLineDepth());
            pstmt.setDouble(7, d.getCompletionPercentage());

            pstmt.executeUpdate();

        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public static void main(String[] args) {

        TestPGN test = new TestPGN();

        test.processPGNFolder(
            "C:/Users/qylga/eclipse-workspace/PostgresqlChess/src/main/resources/pgn_files/white_games"
        );
    }
}