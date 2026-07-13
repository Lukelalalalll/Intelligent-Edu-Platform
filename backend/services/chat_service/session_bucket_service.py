"""AI Chat Session Bucket Service — prevents 16MB BSON document overflow.

Implements the MongoDB Bucket Pattern (MongoDB Schema Design Patterns, 2019)
for AI chat sessions.  When sessions grow large, messages are split across
fixed-size bucket documents instead of being stored as an unbounded embedded
array in a single document.

Bucket layout:
    Collection: ``ai_session_buckets``
    {
        "sessionId":    ObjectId,       ← parent session
        "bucketIndex":  int,            ← 0, 1, 2, …
        "messages":     [dict, …],      ← up to BUCKET_SIZE messages
        "messageCount": int,
        "createdAt":    datetime,
    }

The main ``ai_chat_sessions`` document keeps only a lightweight header
(title, meta, first-bucket messages for backward compat).

Reference:
    MongoDB Inc., "Building with Patterns: The Bucket Pattern", 2019.
    Abadi et al., "Column-Oriented Database Systems", VLDB 2008.
"""
from __future__ import annotations

import logging
import math
from typing import Any

from backend.core.database import db
from backend.repositories._helpers import require_object_id, utcnow

logger = logging.getLogger(__name__)

BUCKET_SIZE = 50  # messages per bucket
BUCKET_COLLECTION = "ai_session_buckets"


async def save_messages_bucketed(
    session_id: str,
    messages: list[dict[str, Any]],
) -> dict[str, Any]:
    """Persist messages using the bucket pattern.

    * If len(messages) <= BUCKET_SIZE, stores them inline in the session
      document (no buckets needed — avoids overhead for short sessions).
    * If len(messages) > BUCKET_SIZE, splits into N bucket documents and
      stores only the latest BUCKET_SIZE messages inline.

    Returns a dict with ``inline_messages`` (to store on the session doc)
    and ``bucket_count``.
    """
    total = len(messages)
    session_oid = require_object_id(session_id, detail="Invalid session id")

    if total <= BUCKET_SIZE:
        # Short session — no buckets needed, wipe any old ones
        await db[BUCKET_COLLECTION].delete_many({"sessionId": session_oid})
        return {"inline_messages": messages, "bucket_count": 0}

    # Split into buckets
    num_buckets = math.ceil(total / BUCKET_SIZE)
    now = utcnow()

    # Delete old buckets and re-write (simple & idempotent)
    await db[BUCKET_COLLECTION].delete_many({"sessionId": session_oid})

    bucket_docs = []
    for i in range(num_buckets - 1):  # all except the last bucket
        start = i * BUCKET_SIZE
        end = start + BUCKET_SIZE
        bucket_docs.append({
            "sessionId": session_oid,
            "bucketIndex": i,
            "messages": messages[start:end],
            "messageCount": end - start,
            "createdAt": now,
        })

    if bucket_docs:
        await db[BUCKET_COLLECTION].insert_many(bucket_docs)

    # The last chunk stays inline on the session document
    inline_start = (num_buckets - 1) * BUCKET_SIZE
    inline_messages = messages[inline_start:]

    logger.info(
        "Bucketed session %s: %d messages → %d buckets + %d inline",
        session_id, total, len(bucket_docs), len(inline_messages),
    )
    return {
        "inline_messages": inline_messages,
        "bucket_count": len(bucket_docs),
    }


async def append_messages_bucketed(
    session_id: str,
    delta_messages: list[dict[str, Any]],
    *,
    existing_inline_messages: list[dict[str, Any]] | None = None,
    existing_bucket_count: int = 0,
) -> dict[str, Any]:
    """Append new messages to the current inline tail without rewriting old buckets."""
    inline_messages = list(existing_inline_messages or [])
    session_oid = require_object_id(session_id, detail="Invalid session id")
    if not delta_messages:
        return {
            "inline_messages": inline_messages,
            "bucket_count": int(existing_bucket_count or 0),
        }

    combined = [*inline_messages, *delta_messages]
    if len(combined) <= BUCKET_SIZE:
        return {
            "inline_messages": combined,
            "bucket_count": int(existing_bucket_count or 0),
        }

    remainder = len(combined) % BUCKET_SIZE or BUCKET_SIZE
    promote_count = len(combined) - remainder
    promote_messages = combined[:promote_count]
    next_inline_messages = combined[promote_count:]
    next_bucket_index = int(existing_bucket_count or 0)
    now = utcnow()

    bucket_docs = []
    for start in range(0, promote_count, BUCKET_SIZE):
        chunk = promote_messages[start:start + BUCKET_SIZE]
        bucket_docs.append({
            "sessionId": session_oid,
            "bucketIndex": next_bucket_index,
            "messages": chunk,
            "messageCount": len(chunk),
            "createdAt": now,
        })
        next_bucket_index += 1

    if bucket_docs:
        await db[BUCKET_COLLECTION].insert_many(bucket_docs)

    return {
        "inline_messages": next_inline_messages,
        "bucket_count": next_bucket_index,
    }


async def load_all_messages(session_id: str, inline_messages: list[dict]) -> list[dict]:
    """Reconstruct the full message list from buckets + inline tail.

    If no buckets exist, ``inline_messages`` is the complete list.
    """
    session_oid = require_object_id(session_id, detail="Invalid session id")
    cursor = db[BUCKET_COLLECTION].find(
        {"sessionId": session_oid},
    ).sort("bucketIndex", 1)

    all_messages: list[dict] = []
    async for bucket in cursor:
        all_messages.extend(bucket.get("messages", []))

    all_messages.extend(inline_messages or [])
    return all_messages


async def delete_session_buckets(session_id: str) -> int:
    """Remove all buckets for a session. Returns deleted count."""
    result = await db[BUCKET_COLLECTION].delete_many(
        {"sessionId": require_object_id(session_id, detail="Invalid session id")},
    )
    return result.deleted_count


async def ensure_bucket_indexes() -> None:
    """Create indexes for the bucket collection."""
    await db[BUCKET_COLLECTION].create_index(
        [("sessionId", 1), ("bucketIndex", 1)],
        unique=True,
        background=True,
    )
