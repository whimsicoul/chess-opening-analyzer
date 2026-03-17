package com.chessdata.sql;

import java.sql.Connection;
import java.sql.DriverManager;
import java.util.List;

public class RepertoireBuilder {

    private DeviationDetector detector;

    public RepertoireBuilder() {
        try {
            String url = "jdbc:postgresql://localhost:5432/ChessOpenings";
            String user = "postgres";
            String password = System.getenv("DB_PASSWORD");

            Connection conn = DriverManager.getConnection(url, user, password);

            detector = new DeviationDetector(conn);

        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public void build() {

        // ✅ YOUR OPENING LINE
        List<String> line = List.of(
            "Nf3","d5","g3","c6","Bg2","Nf6","O-O","Bg4",
            "h3","Bxf3","Bxf3","e5","d4","e4","Bg2","Be7","c4"
        );

        detector.addLineToTree(line);
    }

    public static void main(String[] args) {
        RepertoireBuilder builder = new RepertoireBuilder();
        builder.build();
    }
}