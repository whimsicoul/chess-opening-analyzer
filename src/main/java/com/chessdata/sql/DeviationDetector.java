package com.chessdata.sql;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.List;

public class DeviationDetector {

    private Connection conn;

    public DeviationDetector(Connection conn) {
        this.conn = conn;
    }

    public DeviationResult findDeviation(List<String> moves) {

        int currentPositionId = 0; // ROOT

        for (int i = 0; i < moves.size(); i++) {
            String move = moves.get(i);

            Integer nextPositionId = findNextPosition(currentPositionId, move);

            if (nextPositionId == null) {

                // ✅ Who deviated?
                boolean isWhiteMove = (i % 2 == 0);
                boolean opponentDeviation = !isWhiteMove;

                // ✅ Convert index → move number
                int moveNumber = (i / 2) + 1;

                return new DeviationResult(
                        moveNumber,
                        move,
                        currentPositionId,
                        0,      // deviationDepth (future)
                        i,      // lineDepth
                        0.0,    // completion %
                        opponentDeviation
                );
            }

            currentPositionId = nextPositionId;
        }

        return null; // no deviation
    }

    private Integer findNextPosition(int positionId, String move) {

        String sql = "SELECT id FROM opening_tree WHERE parent_id = ? AND move_san = ?";

        try (PreparedStatement pstmt = conn.prepareStatement(sql)) {

            pstmt.setInt(1, positionId);
            pstmt.setString(2, move.trim());

            ResultSet rs = pstmt.executeQuery();

            if (rs.next()) {
                return rs.getInt("id");
            }

        } catch (Exception e) {
            e.printStackTrace();
        }

        return null;
    }

    // ✅ ADD LINE TO OPENING TREE
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

    // ✅ HELPER METHOD
    private int insertPosition(int parentId, String move) {

        String sql = "INSERT INTO opening_tree (parent_id, move_san) VALUES (?, ?) RETURNING id";

        try (PreparedStatement pstmt = conn.prepareStatement(sql)) {

            pstmt.setInt(1, parentId);
            pstmt.setString(2, move.trim());

            ResultSet rs = pstmt.executeQuery();

            if (rs.next()) {
                return rs.getInt(1);
            }

        } catch (Exception e) {
            e.printStackTrace();
        }

        return -1;
    }
}