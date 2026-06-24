from __future__ import annotations

from datetime import datetime, timedelta, timezone

PASSWORD_RESET_TOKEN_TTL = timedelta(minutes=30)


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
