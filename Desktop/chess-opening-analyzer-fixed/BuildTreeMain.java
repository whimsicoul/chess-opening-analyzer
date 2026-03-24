package com.chessdata.sql;

import java.sql.Connection;
import java.sql.DriverManager;

public class BuildTreeMain {

    public static void main(String[] args) {
        // FIX: all three DB params from env vars (was hardcoding url + user)
        String url      = System.getenv().getOrDefault("DB_URL",  "jdbc:postgresql://localhost:5432/ChessOpenings");
        String user     = System.getenv().getOrDefault("DB_USER", "postgres");
        String password = System.getenv("DB_PASSWORD");

        if (password == null) {
            throw new RuntimeException("DB_PASSWORD environment variable not set");
        }

        boolean playingAsWhite = !(args.length > 0 && args[0].equals("--black"));

        try (Connection conn = DriverManager.getConnection(url, user, password)) {
            OpeningTreeBuilder builder = new OpeningTreeBuilder(conn, playingAsWhite);
            builder.buildTree();
            System.out.println((playingAsWhite ? "White" : "Black") + " opening tree built successfully!");
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
