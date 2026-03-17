package com.chessdata.sql;

import java.sql.*;
import java.util.*;

public class OpeningTreeBuilder {

    private Connection conn;

    public OpeningTreeBuilder(Connection conn) {
        this.conn = conn;
    }

    public void buildTree() throws SQLException {

        String selectSQL = "SELECT opening_name, eco_code, moves FROM white_opening";
        Statement stmt = conn.createStatement();
        ResultSet rs = stmt.executeQuery(selectSQL);

        while (rs.next()) {
            String openingName = rs.getString("opening_name");
            String ecoCode = rs.getString("eco_code");
            String moves = rs.getString("moves");

            List<String> moveList = parseMoves(moves);

            int currentParent = 0; // root

            for (String move : moveList) {
                currentParent = getOrCreateNode(currentParent, move, openingName, ecoCode);
            }
        }
    }

    // -------------------------
    // Parse moves from string
    // -------------------------
    private List<String> parseMoves(String moves) {

        // Remove move numbers like "1." "2."
        moves = moves.replaceAll("\\d+\\.", "");

        // Clean whitespace
        moves = moves.trim().replaceAll("\\s+", " ");

        return Arrays.asList(moves.split(" "));
    }

    // -------------------------
    // Insert or reuse node
    // -------------------------
    private int getOrCreateNode(int parentId, String move, String openingName, String ecoCode) throws SQLException {

        String checkSQL = "SELECT id FROM opening_tree WHERE parent_id = ? AND move_san = ?";
        PreparedStatement checkStmt = conn.prepareStatement(checkSQL);

        checkStmt.setInt(1, parentId);
        checkStmt.setString(2, move);

        ResultSet rs = checkStmt.executeQuery();

        if (rs.next()) {
            return rs.getInt("id");
        }

        String insertSQL = "INSERT INTO opening_tree (parent_id, move_san, opening_name, eco_code) VALUES (?, ?, ?, ?) RETURNING id";
        PreparedStatement insertStmt = conn.prepareStatement(insertSQL);

        insertStmt.setInt(1, parentId);
        insertStmt.setString(2, move);
        insertStmt.setString(3, openingName);
        insertStmt.setString(4, ecoCode);

        ResultSet insertRs = insertStmt.executeQuery();
        insertRs.next();

        return insertRs.getInt(1);
    }
}