import os
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError

from db import get_connection

SECRET_KEY = os.getenv("JWT_SECRET")
if not SECRET_KEY or SECRET_KEY == "change-me-in-production":
    raise RuntimeError(
        "JWT_SECRET environment variable is not set or is using the insecure default. "
        "Set a strong random secret before starting the server."
    )

ALGORITHM = "HS256"
EXPIRE_DAYS = int(os.getenv("JWT_EXPIRE_DAYS", 7))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def create_access_token(user_id: int, username: str, token_version: int = 0) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=EXPIRE_DAYS)
    payload = {"sub": str(user_id), "username": username, "tv": token_version, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def _user_from_token(token: str) -> dict | None:
    """Decode and check the token against the database: the account must
    still exist and the token's version ("tv") must match users.token_version,
    which is bumped on password change — so changing your password (or
    deleting the account) revokes every previously issued token. Tokens
    issued before versioning carry no "tv" and count as version 0, matching
    the column default. Username comes from the DB so it's never stale."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except (JWTError, KeyError, TypeError, ValueError):
        return None

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT username, token_version FROM users WHERE id = %s", (user_id,))
            row = cur.fetchone()
    if row is None or payload.get("tv", 0) != row["token_version"]:
        return None
    return {"user_id": user_id, "username": row["username"]}


def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    user = _user_from_token(token)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def get_current_user_optional(token: str | None = Depends(oauth2_scheme_optional)) -> dict | None:
    """Like get_current_user, but returns None instead of raising 401 when no
    (or an invalid/expired/revoked) token is present — for routes that should
    work for guests as well as logged-in users."""
    if token is None:
        return None
    return _user_from_token(token)
