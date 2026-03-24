package com.chessdata.sql;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;

public class PostgreSQLConnection {

    public static void main(String[] args) {
        // FIX: all three DB params from env vars (was hardcoding url + user)
        String url      = System.getenv().getOrDefault("DB_URL",  "jdbc:postgresql://localhost:5432/ChessOpenings");
        String user     = System.getenv().getOrDefault("DB_USER", "postgres");
        String password = System.getenv("DB_PASSWORD");

        if (password == null) {
            System.err.println("DB_PASSWORD environment variable not set");
            return;
        }

        // FIX: try-with-resources ensures connection is always closed
        try (Connection conn = DriverManager.getConnection(url, user, password);
             Statement  stmt = conn.createStatement();
             ResultSet  rs   = stmt.executeQuery("SELECT * FROM white_opening")) {

            while (rs.next()) {
                System.out.println("Opening Name: " + rs.getString("opening_name"));
                System.out.println("ECO Code: "     + rs.getString("eco_code"));
                System.out.println("Moves: "         + rs.getString("moves"));
                System.out.println("-----------------------------");
            }

        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
