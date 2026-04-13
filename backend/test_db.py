#!/usr/bin/env python3
import os
from db import get_connection

def test_connection():
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT version();")
                version = cur.fetchone()
                print("Connected to PostgreSQL!")
                print(f"Version: {version['version']}")
                return True
    except Exception as e:
        print(f"Connection failed: {e}")
        return False

if __name__ == "__main__":
    test_connection()