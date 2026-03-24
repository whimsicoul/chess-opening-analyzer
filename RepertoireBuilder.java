package com.chessdata.sql;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Arrays;
import java.util.List;

public class RepertoireBuilder {

    private Connection conn;
    private DeviationDetector detector;
    private String sourceTable;

    public RepertoireBuilder() {
        this(true);
    }

    public RepertoireBuilder(boolean playingAsWhite) {
        try {
            // FIX: all three DB params from env vars (was hardcoding url + user)
            String url      = System.getenv().getOrDefault("DB_URL",  "jdbc:postgresql://localhost:5432/ChessOpenings");
            String user     = System.getenv().getOrDefault("DB_USER", "postgres");
            String password = System.getenv("DB_PASSWORD");

            if (password == null) {
                throw new RuntimeException("DB_PASSWORD environment variable not set");
            }

            conn        = DriverManager.getConnection(url, user, password);
            detector    = new DeviationDetector(conn, playingAsWhite);
            sourceTable = playingAsWhite ? "white_opening" : "black_opening";

        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    // IMPROVEMENT: load all lines from white_opening table instead of one hardcoded line
    public void buildFromDatabase() {
        String sql = "SELECT opening_name, eco_code, moves FROM " + sourceTable;

        try (Statement stmt = conn.createStatement();
             ResultSet rs   = stmt.executeQuery(sql)) {

            int count = 0;
            while (rs.next()) {
                String openingName = rs.getString("opening_name");
                String ecoCode     = rs.getString("eco_code");
                String movesStr    = rs.getString("moves");

                // Strip move numbers (e.g. "1.Nf3" -> "Nf3")
                movesStr = movesStr.replaceAll("\\d+\\.", "").trim().replaceAll("\\s+", " ");
                List<String> moves = Arrays.asList(movesStr.split(" "));

                System.out.println("Adding line: " + openingName + " (" + ecoCode + ")");
                detector.addLineToTree(moves);
                count++;
            }

            System.out.println("Repertoire built from database: " + count + " lines added.");

        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    // Also keep the ability to add a single custom line manually
    public void addCustomLine(List<String> moves) {
        System.out.println("Adding custom line: " + moves);
        detector.addLineToTree(moves);
    }

    public static void main(String[] args) {
        boolean playingAsWhite = !hasFlag(args, "--black");
        RepertoireBuilder builder = new RepertoireBuilder(playingAsWhite);

        // IMPROVEMENT: load from DB by default; pass --custom to use the hardcoded line
        if (hasFlag(args, "--custom")) {
            List<String> customLine = List.of(
                "Nf3","d5","g3","c6","Bg2","Nf6","O-O","Bg4",
                "h3","Bxf3","Bxf3","e5","d4","e4","Bg2","Be7","c4"
            );
            builder.addCustomLine(customLine);
        } else {
            builder.buildFromDatabase();
        }
    }

    private static boolean hasFlag(String[] args, String flag) {
        for (String arg : args) {
            if (arg.equals(flag)) return true;
        }
        return false;
    }
}
