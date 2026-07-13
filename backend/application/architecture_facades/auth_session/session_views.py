from __future__ import annotations


def serialize_session(doc: dict, *, current_session_id: str | None = None) -> dict:
    return {
        "sessionId": str(doc.get("session_id") or ""),
        "createdAt": doc.get("created_at").isoformat() if doc.get("created_at") else None,
        "lastSeenAt": doc.get("last_seen_at").isoformat() if doc.get("last_seen_at") else None,
        "lastRotatedAt": doc.get("last_rotated_at").isoformat() if doc.get("last_rotated_at") else None,
        "expiresAt": doc.get("expires_at").isoformat() if doc.get("expires_at") else None,
        "stepUpExpiresAt": doc.get("step_up_expires_at").isoformat() if doc.get("step_up_expires_at") else None,
        "current": str(doc.get("session_id") or "") == str(current_session_id or ""),
        "amr": list(doc.get("amr") or []),
        "deviceLabel": doc.get("device_label") or "Unknown device",
        "browser": doc.get("browser") or "Unknown browser",
        "os": doc.get("os") or "Unknown OS",
        "deviceType": doc.get("device_type") or "desktop",
        "ipLabel": doc.get("ip_label") or "",
    }
