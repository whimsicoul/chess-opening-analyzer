package com.chessdata.sql;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.List;

public class DeviationDetector {

    private Connection conn;
    private String treeTable;
    private boolean playingAsWhite;

    public DeviationDetector(Connection conn) {
        this(conn, true);
    }

    public DeviationDetector(Connection conn, boolean playingAsWhite) {
        this.conn = conn;
        this.playingAsWhite = playingAsWhite;
        this.treeTable = playingAsWhite ? "opening_tree" : "black_opening_tree";
    }

    public DeviationResult findDeviation(List<String> moves) {
        int currentPositionId = 0; // ROOT

        for (int i = 0; i < moves.size(); i++) {
            String move = moves.get(i);
            Integer nextPositionId = findNextPosition(currentPositionId, move);

            if (nextPositionId == null) {
                boolean isWhiteMove     = (i % 2 == 0);
                // For white: we deviated on white moves, opponent on black moves.
                // For black: opponent (white) deviates on white moves, we deviate on black moves.
                boolean opponentDeviated = playingAsWhite ? !isWhiteMove : isWhiteMove;
                int moveNumber = (i / 2) + 1;

                return new DeviationResult(
                        moveNumber,
                        move,
                        currentPositionId,
                        0,      // deviationDepth (future use)
                        i,      // lineDepth
                        0.0,    // completionPercentage (future use)
                        opponentDeviated
                );
            }

            currentPositionId = nextPositionId;
        }

        return null; // no deviation — game stayed in repertoire
    }

    // BUG FIX: ResultSet now closed via try-with-resources
    private Integer findNextPosition(int positionId, String move) {
        String sql = "SELECT id FROM " + treeTable + " WHERE parent_id = ? AND move_san = ?";

        try (PreparedStatement pstmt = conn.prepareStatement(sql)) {
            pstmt.setInt(1, positionId);
            pstmt.setString(2, move.trim());

            try (ResultSet rs = pstmt.executeQuery()) {
                if (rs.next()) {
                    return rs.getInt("id");
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        return null;
    }

    // Add a line to the opening tree (used by RepertoireBuilder)
    public void addLineToTree(List<String> moves) {
        int currentPositionId = 0; // root

        for (String move : moves) {
            Integer nextPositionId = findNextPosition(currentPositionId, move);

            if (nextPositionId != null) {
                currentPositionId = nextPositionId;
            } else {
                int newId = insertPosition(currentPositionId, move);
                if (newId == -1) {
                    System.out.println("Failed to insert move: " + move);
                    return;
                }
                System.out.println("Inserted move: " + move + " (id=" + newId + ")");
                currentPositionId = newId;
            }
        }

        System.out.println("Line successfully added to opening tree.");
    }

    // BUG FIX: ResultSet now closed via try-with-resources
    private int insertPosition(int parentId, String move) {
        String sql = "INSERT INTO " + treeTable + " (parent_id, move_san) VALUES (?, ?) RETURNING id";

        try (PreparedStatement pstmt = conn.prepareStatement(sql)) {
            pstmt.setInt(1, parentId);
            pstmt.setString(2, move.trim());

            try (ResultSet rs = pstmt.executeQuery()) {
                if (rs.next()) {
                    return rs.getInt(1);
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        return -1;
    }
}
