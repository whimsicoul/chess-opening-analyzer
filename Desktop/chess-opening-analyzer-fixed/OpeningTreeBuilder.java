package com.chessdata.sql;

import java.sql.*;
import java.util.*;

public class OpeningTreeBuilder {

    private Connection conn;
    private String sourceTable;
    private String treeTable;

    public OpeningTreeBuilder(Connection conn) {
        this(conn, true);
    }

    public OpeningTreeBuilder(Connection conn, boolean playingAsWhite) {
        this.conn = conn;
        this.sourceTable = playingAsWhite ? "white_opening" : "black_opening";
        this.treeTable   = playingAsWhite ? "opening_tree"  : "black_opening_tree";
    }

    public void buildTree() throws SQLException {
        String selectSQL = "SELECT opening_name, eco_code, moves FROM " + sourceTable;

        // BUG FIX: Statement and ResultSet both closed via try-with-resources
        try (Statement stmt = conn.createStatement();
             ResultSet rs   = stmt.executeQuery(selectSQL)) {

            while (rs.next()) {
                String openingName = rs.getString("opening_name");
                String ecoCode     = rs.getString("eco_code");
                String moves       = rs.getString("moves");

                List<String> moveList = parseMoves(moves);

                int currentParent = 0; // root
                for (String move : moveList) {
                    currentParent = getOrCreateNode(currentParent, move, openingName, ecoCode);
                }
            }
        }
    }

    private List<String> parseMoves(String moves) {
        moves = moves.replaceAll("\\d+\\.", "");
        moves = moves.trim().replaceAll("\\s+", " ");
        return Arrays.asList(moves.split(" "));
    }

    // BUG FIX: both PreparedStatements and their ResultSets now in try-with-resources
    private int getOrCreateNode(int parentId, String move, String openingName, String ecoCode) throws SQLException {
        String checkSQL = "SELECT id FROM " + treeTable + " WHERE parent_id = ? AND move_san = ?";

        try (PreparedStatement checkStmt = conn.prepareStatement(checkSQL)) {
            checkStmt.setInt(1, parentId);
            checkStmt.setString(2, move);

            try (ResultSet rs = checkStmt.executeQuery()) {
                if (rs.next()) {
                    return rs.getInt("id");
                }
            }
        }

        String insertSQL = "INSERT INTO " + treeTable + " (parent_id, move_san, opening_name, eco_code) " +
                           "VALUES (?, ?, ?, ?) RETURNING id";

        try (PreparedStatement insertStmt = conn.prepareStatement(insertSQL)) {
            insertStmt.setInt(1, parentId);
            insertStmt.setString(2, move);
            insertStmt.setString(3, openingName);
            insertStmt.setString(4, ecoCode);

            try (ResultSet insertRs = insertStmt.executeQuery()) {
                if (insertRs.next()) {
                    return insertRs.getInt(1);
                }
            }
        }

        throw new SQLException("Failed to insert or find node for move: " + move);
    }
}
