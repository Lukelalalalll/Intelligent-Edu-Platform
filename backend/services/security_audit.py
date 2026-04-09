import logging
from typing import Any

logger = logging.getLogger("backend.security.audit")


def log_security_event(
    *,
    level: str,
    request_id: str,
    user_id: str,
    endpoint: str,
    action: str,
    detail: str,
    extra: dict[str, Any] | None = None,
) -> None:
    payload = {
        "request_id": request_id or "unknown",
        "user_id": user_id or "anonymous",
        "endpoint": endpoint or "unknown",
        "action": action,
        "detail": detail,
    }
    if extra:
        payload.update(extra)

    line = (
        "security_event "
        f"request_id={payload['request_id']} "
        f"user_id={payload['user_id']} "
        f"endpoint={payload['endpoint']} "
        f"action={payload['action']} "
        f"detail={payload['detail']}"
    )

    level_name = str(level or "info").strip().lower()
    if level_name == "error":
        logger.error(line)
    elif level_name == "warning":
        logger.warning(line)
    else:
        logger.info(line)
