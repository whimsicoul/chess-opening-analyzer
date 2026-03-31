import re
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from auth_utils import create_access_token, get_current_user
from db import get_connection
from email_utils import send_verification_email

router = APIRouter(prefix="/auth", tags=["auth"])

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str


class VerifyRequest(BaseModel):
    email: str
    code: str


class ResendRequest(BaseModel):
    email: str


class LoginRequest(BaseModel):
    email: str
    password: str


class ChangeUsernameRequest(BaseModel):
    current_password: str
    new_username: str


class ChangeEmailRequest(BaseModel):
    current_password: str
    new_email: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class DeleteAccountRequest(BaseModel):
    password: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{3,20}$")


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _check_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def _generate_code() -> str:
    return str(secrets.randbelow(1_000_000)).zfill(6)


# ---------------------------------------------------------------------------
# POST /auth/register
# ---------------------------------------------------------------------------

@router.post("/register", status_code=201)
def register(body: RegisterRequest):
    # Validate inputs
    if not _USERNAME_RE.match(body.username):
        raise HTTPException(400, "Username must be 3–20 alphanumeric characters or underscores")
    if not _EMAIL_RE.match(body.email):
        raise HTTPException(400, "Invalid email address")
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    hashed = _hash_password(body.password)

    with get_connection() as conn:
        with conn.cursor() as cur:
            # Check uniqueness
            cur.execute("SELECT id FROM users WHERE email = %s OR username = %s",
                        (body.email.lower(), body.username))
            existing = cur.fetchone()
            if existing:
                raise HTTPException(409, "Email or username already in use")

            cur.execute(
                """
                INSERT INTO users (username, email, hashed_password)
                VALUES (%s, %s, %s)
                RETURNING id
                """,
                (body.username, body.email.lower(), hashed),
            )
            user_id = cur.fetchone()["id"]

            code = _generate_code()
            expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
            cur.execute(
                """
                INSERT INTO email_verifications (user_id, code, expires_at)
                VALUES (%s, %s, %s)
                """,
                (user_id, code, expires_at),
            )
        conn.commit()

    try:
        send_verification_email(body.email, code)
    except Exception as e:
        # Don't fail registration if email sending fails — user can resend
        print(f"[email] Failed to send verification to {body.email}: {e}")

    return {"message": "Account created. Check your email for a verification code."}


# ---------------------------------------------------------------------------
# POST /auth/verify-email
# ---------------------------------------------------------------------------

@router.post("/verify-email")
def verify_email(body: VerifyRequest):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT ev.id, ev.user_id, ev.expires_at
                FROM email_verifications ev
                JOIN users u ON u.id = ev.user_id
                WHERE u.email = %s
                  AND ev.code = %s
                  AND ev.used = FALSE
                  AND ev.expires_at > NOW()
                ORDER BY ev.id DESC
                LIMIT 1
                """,
                (body.email.lower(), body.code),
            )
            row = cur.fetchone()
            if row is None:
                raise HTTPException(400, "Invalid or expired verification code")

            cur.execute("UPDATE email_verifications SET used = TRUE WHERE id = %s", (row["id"],))
            cur.execute("UPDATE users SET is_verified = TRUE WHERE id = %s", (row["user_id"],))
        conn.commit()

    return {"message": "Email verified. You can now log in."}


# ---------------------------------------------------------------------------
# POST /auth/resend-verification
# ---------------------------------------------------------------------------

@router.post("/resend-verification")
def resend_verification(body: ResendRequest):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, is_verified FROM users WHERE email = %s",
                (body.email.lower(),),
            )
            user = cur.fetchone()
            if user is None:
                # Don't reveal whether the email exists
                return {"message": "If that email exists, a new code has been sent."}
            if user["is_verified"]:
                raise HTTPException(400, "Account is already verified")

            # Rate-limit: reject if a code was sent within the last 60 seconds
            cur.execute(
                """
                SELECT created_at FROM email_verifications
                WHERE user_id = %s
                ORDER BY id DESC LIMIT 1
                """,
                (user["id"],),
            )
            last = cur.fetchone()
            if last:
                age = datetime.now(timezone.utc) - last["created_at"].replace(tzinfo=timezone.utc)
                if age.total_seconds() < 60:
                    raise HTTPException(429, "Please wait before requesting another code")

            code = _generate_code()
            expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
            cur.execute(
                """
                INSERT INTO email_verifications (user_id, code, expires_at)
                VALUES (%s, %s, %s)
                """,
                (user["id"], code, expires_at),
            )
        conn.commit()

    try:
        send_verification_email(body.email, code)
    except Exception as e:
        print(f"[email] Failed to resend verification to {body.email}: {e}")

    return {"message": "If that email exists, a new code has been sent."}


# ---------------------------------------------------------------------------
# POST /auth/login
# ---------------------------------------------------------------------------

@router.post("/login")
def login(body: LoginRequest):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, username, hashed_password, is_verified FROM users WHERE email = %s",
                (body.email.lower(),),
            )
            user = cur.fetchone()

    if user is None or not _check_password(body.password, user["hashed_password"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    if not user["is_verified"]:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Email not verified. Check your inbox for a verification code.",
        )

    token = create_access_token(user["id"], user["username"])
    return {"access_token": token, "token_type": "bearer", "username": user["username"]}


# ---------------------------------------------------------------------------
# GET /auth/me
# ---------------------------------------------------------------------------

@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, username, email, created_at FROM users WHERE id = %s",
                (current_user["user_id"],),
            )
            user = cur.fetchone()
    if user is None:
        raise HTTPException(404, "User not found")
    return user


# ---------------------------------------------------------------------------
# PATCH /auth/username
# ---------------------------------------------------------------------------

@router.patch("/username")
def change_username(
    body: ChangeUsernameRequest,
    current_user: dict = Depends(get_current_user),
):
    if not _USERNAME_RE.match(body.new_username):
        raise HTTPException(400, "Username must be 3–20 alphanumeric characters or underscores")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT hashed_password FROM users WHERE id = %s", (current_user["user_id"],))
            row = cur.fetchone()
            if row is None:
                raise HTTPException(404, "User not found")
            if not _check_password(body.current_password, row["hashed_password"]):
                raise HTTPException(400, "Incorrect current password")

            cur.execute(
                "SELECT id FROM users WHERE username = %s AND id != %s",
                (body.new_username, current_user["user_id"]),
            )
            if cur.fetchone():
                raise HTTPException(409, "Username already taken")

            cur.execute(
                "UPDATE users SET username = %s WHERE id = %s",
                (body.new_username, current_user["user_id"]),
            )
        conn.commit()

    return {"username": body.new_username}


# ---------------------------------------------------------------------------
# PATCH /auth/email
# ---------------------------------------------------------------------------

@router.patch("/email")
def change_email(
    body: ChangeEmailRequest,
    current_user: dict = Depends(get_current_user),
):
    if not _EMAIL_RE.match(body.new_email):
        raise HTTPException(400, "Invalid email address")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT hashed_password FROM users WHERE id = %s", (current_user["user_id"],))
            row = cur.fetchone()
            if row is None:
                raise HTTPException(404, "User not found")
            if not _check_password(body.current_password, row["hashed_password"]):
                raise HTTPException(400, "Incorrect current password")

            cur.execute(
                "SELECT id FROM users WHERE email = %s AND id != %s",
                (body.new_email.lower(), current_user["user_id"]),
            )
            if cur.fetchone():
                raise HTTPException(409, "Email already in use")

            cur.execute(
                "UPDATE users SET email = %s WHERE id = %s",
                (body.new_email.lower(), current_user["user_id"]),
            )
        conn.commit()

    return {"message": "Email updated successfully"}


# ---------------------------------------------------------------------------
# PATCH /auth/password
# ---------------------------------------------------------------------------

@router.patch("/password")
def change_password(
    body: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
):
    if len(body.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT hashed_password FROM users WHERE id = %s", (current_user["user_id"],))
            row = cur.fetchone()
            if row is None:
                raise HTTPException(404, "User not found")
            if not _check_password(body.current_password, row["hashed_password"]):
                raise HTTPException(400, "Incorrect current password")
            if body.current_password == body.new_password:
                raise HTTPException(400, "New password must differ from current password")

            new_hashed = _hash_password(body.new_password)
            cur.execute(
                "UPDATE users SET hashed_password = %s WHERE id = %s",
                (new_hashed, current_user["user_id"]),
            )
        conn.commit()

    return {"message": "Password updated successfully"}


# ---------------------------------------------------------------------------
# DELETE /auth/account
# ---------------------------------------------------------------------------

@router.delete("/account", status_code=200)
def delete_account(
    body: DeleteAccountRequest,
    current_user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT hashed_password FROM users WHERE id = %s", (current_user["user_id"],))
            row = cur.fetchone()
            if row is None:
                raise HTTPException(404, "User not found")
            if not _check_password(body.password, row["hashed_password"]):
                raise HTTPException(400, "Incorrect password")

            cur.execute("DELETE FROM users WHERE id = %s", (current_user["user_id"],))
        conn.commit()

    return {"message": "Account deleted"}
