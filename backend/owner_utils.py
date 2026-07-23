"""Resolve the current request's data "owner" — a logged-in user_id or an
anonymous guest_id cookie — so repertoire/games features work without an
account. A tiny helper turns an Owner into the SQL fragment + params every
call site needs, without special-casing guest vs. logged-in everywhere."""

import os
import secrets
from dataclasses import dataclass
from fastapi import Depends, Request, Response

from auth_utils import get_current_user_optional

GUEST_COOKIE_NAME = "guest_id"
GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 365  # 1 year


@dataclass(frozen=True)
class Owner:
    column: str   # "user_id" or "guest_id"
    value: object  # int for user_id, str for guest_id

    @property
    def user_id(self):
        return self.value if self.column == "user_id" else None

    @property
    def guest_id(self):
        return self.value if self.column == "guest_id" else None

    def clause(self, alias: str | None = None) -> str:
        """SQL fragment, e.g. 'user_id = %s' or 'g.guest_id = %s'."""
        col = f"{alias}.{self.column}" if alias else self.column
        return f"{col} = %s"


_IS_DEV = os.getenv("APP_ENV", "production") == "development"


def get_owner(
    request: Request,
    response: Response,
    current_user: dict | None = Depends(get_current_user_optional),
) -> Owner:
    """Resolve the request owner: prefer a valid logged-in user; otherwise
    read/issue a guest_id cookie. Always returns a usable Owner, so every
    route depending on this works for guests as well as accounts."""
    if current_user is not None:
        return Owner(column="user_id", value=current_user["user_id"])

    guest_id = request.cookies.get(GUEST_COOKIE_NAME)
    if not guest_id:
        guest_id = secrets.token_urlsafe(24)
        response.set_cookie(
            key=GUEST_COOKIE_NAME,
            value=guest_id,
            max_age=GUEST_COOKIE_MAX_AGE,
            httponly=True,
            # SameSite=None requires Secure, and Secure cookies are only ever
            # sent back over HTTPS — local dev runs over plain HTTP, so both
            # must relax together there. Frontend/backend are cross-origin in
            # production (different domains), so SameSite=None + Secure is
            # required there for the cookie to round-trip at all.
            secure=not _IS_DEV,
            samesite="lax" if _IS_DEV else "none",
            path="/",
        )
    return Owner(column="guest_id", value=guest_id)
