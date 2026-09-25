"""Shared request-rate helpers: client IP resolution behind Railway's proxy,
and a small in-process sliding-window limiter.

In-process is fine for this project's single-instance Railway deploy; a
multi-instance deploy would need a shared store (e.g. Redis or Postgres)
instead. Security-critical limits that must survive restarts (login,
verification codes) live in Postgres — see routers/auth.py.
"""

import threading
import time
from collections import deque

from fastapi import HTTPException, Request


def client_ip(request: Request) -> str | None:
    """Railway's edge sets X-Real-IP to the connecting client's address,
    overwriting any client-supplied value. X-Forwarded-For can't be used: in
    production its rightmost entry is a proxy hop shared by every request
    (which made per-IP limits global), and the leftmost entries are
    client-supplied. No header → direct connection (local dev)."""
    real_ip = request.headers.get("x-real-ip")
    if real_ip and real_ip.strip():
        return real_ip.strip()
    return request.client.host if request.client else None


class RateLimiter:
    """Allow at most `max_requests` per `window_seconds` per key. Sync
    endpoints run in a threadpool, hence the lock. Idle keys are evicted
    periodically so the table doesn't grow with every guest/IP ever seen."""

    def __init__(self, max_requests: int, window_seconds: float, detail: str = "Too many requests — please slow down"):
        self.max_requests = max_requests
        self.window = window_seconds
        self.detail = detail
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()
        self._last_sweep = time.monotonic()

    def check(self, key: str) -> None:
        now = time.monotonic()
        cutoff = now - self.window
        with self._lock:
            if now - self._last_sweep > self.window:
                self._hits = {k: q for k, q in self._hits.items() if q and q[-1] > cutoff}
                self._last_sweep = now

            q = self._hits.setdefault(key, deque())
            while q and q[0] <= cutoff:
                q.popleft()
            if len(q) >= self.max_requests:
                raise HTTPException(status_code=429, detail=self.detail)
            q.append(now)
