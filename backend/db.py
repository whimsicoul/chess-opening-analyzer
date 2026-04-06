import os
import urllib.parse
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

# Global connection pool — reuse connections to keep Neon compute warm
_pool = None


def _get_pool():
    """Get or create a connection pool. Neon pooler endpoint is designed for short-lived connections,
    so we keep a persistent pool to avoid rapid connect/disconnect cycles that show as 'Idle' compute."""
    global _pool
    if _pool is None:
        database_url = os.getenv("DATABASE_URL")
        if database_url:
            parsed = urllib.parse.urlparse(database_url)
            # Replace -pooler with direct compute endpoint for better connection reuse
            # The pooler was causing idle timeouts; using the compute endpoint directly is better for persistent pools
            host = parsed.hostname.replace("-pooler", "") if "-pooler" in parsed.hostname else parsed.hostname

            # Use psycopg2's built-in connection pooling via SimpleConnectionPool (minimum 1, maximum 5 connections)
            from psycopg2 import pool
            _pool = pool.SimpleConnectionPool(
                1, 5,
                host=host,
                port=parsed.port,
                dbname=parsed.path.lstrip("/"),
                user=parsed.username,
                password=parsed.password,
                sslmode="require",  # enforce SSL on compute endpoint
            )
        else:
            from psycopg2 import pool
            _pool = pool.SimpleConnectionPool(
                1, 5,
                host=os.getenv("DB_HOST", "localhost"),
                port=int(os.getenv("DB_PORT", 5432)),
                dbname=os.getenv("DB_NAME"),
                user=os.getenv("DB_USER"),
                password=os.getenv("DB_PASSWORD"),
            )
    return _pool


class PooledConnection:
    """Context manager wrapper for pooled connections that returns RealDictCursor by default."""

    def __init__(self, conn):
        self.conn = conn

    def __enter__(self):
        return self.conn

    def __exit__(self, *args):
        if self.conn:
            _get_pool().putconn(self.conn)


def get_connection():
    """Get a connection from the pool. Always returns a connection with RealDictCursor."""
    pool_obj = _get_pool()
    conn = pool_obj.getconn()

    # Set cursor factory to RealDictCursor for all queries from this connection
    conn.cursor_factory = RealDictCursor

    return PooledConnection(conn)
