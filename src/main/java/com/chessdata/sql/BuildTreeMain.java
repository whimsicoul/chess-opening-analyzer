package com.chessdata.sql;

import java.sql.Connection;
import java.sql.DriverManager;

public class BuildTreeMain {

    public static void main(String[] args) {

        try {
            String url = "jdbc:postgresql://localhost:5432/ChessOpenings";
            String user = "postgres";
            String password = System.getenv("DB_PASSWORD");

            if (password == null) {
                throw new RuntimeException("DB_PASSWORD environment variable not set");
            }

            Connection conn = DriverManager.getConnection(url, user, password);

            OpeningTreeBuilder builder = new OpeningTreeBuilder(conn);
            builder.buildTree();

            System.out.println("Opening tree built successfully!");

        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}