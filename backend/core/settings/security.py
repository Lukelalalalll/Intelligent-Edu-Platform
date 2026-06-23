from __future__ import annotations

from datetime import timedelta
from typing import ClassVar

from pydantic import field_validator

from .base import BaseSettingsSegment


class SecuritySettingsSegment(BaseSettingsSegment):
    SECRET_KEY: str = ""
    JWT_SECRET_KEY: str = ""
    JWT_TOKEN_LOCATION: ClassVar[list[str]] = ["cookies"]
    JWT_COOKIE_CSRF_PROTECT: bool = False
    JWT_ACCESS_COOKIE_NAME: ClassVar[str] = "access_token_cookie"
    JWT_REFRESH_COOKIE_NAME: ClassVar[str] = "refresh_token_cookie"
    JWT_CSRF_COOKIE_NAME: ClassVar[str] = "csrf_token"
    JWT_CSRF_HEADER_NAME: ClassVar[str] = "X-CSRF-Token"
    JWT_MFA_CHALLENGE_COOKIE_NAME: ClassVar[str] = "mfa_challenge_cookie"
    JWT_COOKIE_SAMESITE: str = "lax"
    JWT_COOKIE_SECURE: bool = False
    JWT_EXPIRES_MINUTES: int = 15
    JWT_REFRESH_EXPIRES_DAYS: int = 30
    AUTH_LOGIN_PRINCIPAL_WINDOW_MINUTES: int = 15
    AUTH_LOGIN_PRINCIPAL_MAX_FAILURES: int = 5
    AUTH_LOGIN_PRINCIPAL_LOCKOUT_MINUTES: int = 15
    AUTH_LOGIN_IP_WINDOW_MINUTES: int = 15
    AUTH_LOGIN_IP_MAX_FAILURES: int = 25
    AUTH_LOGIN_IP_LOCKOUT_MINUTES: int = 15
    AUTH_PASSWORD_RESET_IDENTIFIER_WINDOW_MINUTES: int = 60
    AUTH_PASSWORD_RESET_IDENTIFIER_MAX_REQUESTS: int = 3
    AUTH_PASSWORD_RESET_IP_WINDOW_MINUTES: int = 60
    AUTH_PASSWORD_RESET_IP_MAX_REQUESTS: int = 10
    SECURITY_AUDIT_RETENTION_DAYS: int = 180

    @property
    def JWT_ACCESS_TOKEN_EXPIRES(self) -> timedelta:
        return timedelta(minutes=self.JWT_EXPIRES_MINUTES)

    @property
    def JWT_REFRESH_TOKEN_EXPIRES(self) -> timedelta:
        return timedelta(days=self.JWT_REFRESH_EXPIRES_DAYS)

    @field_validator("JWT_COOKIE_SAMESITE", mode="before")
    @classmethod
    def lower_samesite(cls, value: str) -> str:
        return str(value or "lax").strip().lower()
