package com.chessdata.sql;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.sql.ResultSet;
import java.sql.SQLException;

public class PostgreSQLConnection {
	public static void main(String[] args) {
		// JDBC URL for PostgreSQL
		String url = "jdbc:postgresql://localhost:5432/ChessOpenings";
		String user = "postgres";
		String password = System.getenv("DB_PASSWORD");

		// Create a connection object
		Connection connection = null;

		try {
			// Step 1: Load the PostgreSQL JDBC driver (not necessary for newer versions)
			Class.forName("org.postgresql.Driver");

			// Step 2: Connect to the database
			connection = DriverManager.getConnection(url, user, password);

			// Step 3: Create a statement
			Statement statement = connection.createStatement();

			// Step 4: Execute a query
			String sql = "SELECT * FROM white_opening";
			ResultSet resultSet = statement.executeQuery(sql);

			// Step 5: Process the results
			while (resultSet.next()) {
				// Correct column names based on your table schema
				String openingName = resultSet.getString("opening_name");
				String ecoCode = resultSet.getString("eco_code");
				String moves = resultSet.getString("moves");

				// Print the values of each column
				System.out.println("Opening Name: " + openingName);
				System.out.println("ECO Code: " + ecoCode);
				System.out.println("Moves: " + moves);
				System.out.println("-----------------------------");
			}
		} catch (ClassNotFoundException e) {
			e.printStackTrace();
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			// Step 6: Close the connection
			try {
				if (connection != null) {
					connection.close();
				}
			} catch (SQLException e) {
				e.printStackTrace();
			}
		}
	}
}