"""Authentication endpoint registration facade.

Endpoint implementations are split by responsibility across this package; importing
this module preserves the original side effect of registering all auth routes.
"""
from __future__ import annotations

from .auth_cookies import _clear_auth_cookies, _set_auth_cookies, _set_csrf_cookie, _set_mfa_challenge_cookie
from .auth_google import _finalize_google_login, login_google, login_google_complete, login_google_link
from .auth_login import login, verify_login_mfa
from .auth_password import register, reset_password_confirm, reset_password_request
from .auth_sessions import delete_session, get_session, get_sessions, logout, logout_all, refresh_session, update_profile

__all__ = [
    "_clear_auth_cookies",
    "_set_auth_cookies",
    "_set_csrf_cookie",
    "_set_mfa_challenge_cookie",
    "_finalize_google_login",
    "register",
    "reset_password_request",
    "reset_password_confirm",
    "login",
    "login_google",
    "login_google_link",
    "login_google_complete",
    "verify_login_mfa",
    "refresh_session",
    "logout",
    "logout_all",
    "get_session",
    "get_sessions",
    "delete_session",
    "update_profile",
]
