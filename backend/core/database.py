import asyncio
import logging
import threading
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel
from pymongo.errors import OperationFailure

from backend.config import Config

logger = logging.getLogger(__name__)

# ── TTL constants (seconds) ───────────────────────────────────────────────────
_TTL_7D       =   7 * 24 * 3600
_TTL_30D      =  30 * 24 * 3600
_TTL_90D      =  90 * 24 * 3600
_TTL_180D     = 180 * 24 * 3600
_TTL_ON_FIELD = 0  # MongoDB expires document when its own expires_at is reached

# ── Collections that share identical generation-history index structure ────────
_GEN_HISTORY_COLS = [
    "sub1_generation_history",
    "sub2_generation_history",
    "sub3_generation_history",
    "sub4_generation_history",
    "sub5_generation_history",
    "video_generation_history",
]

_client_lock = threading.Lock()
_client: AsyncIOMotorClient | None = None
_client_loop_id: int | None = None


def _create_client() -> AsyncIOMotorClient:
    return AsyncIOMotorClient(
        Config.MONGO_URI,
        tz_aware=True,
        maxPoolSize=50,
        minPoolSize=5,
        serverSelectionTimeoutMS=5000,
        connectTimeoutMS=5000,
        socketTimeoutMS=30000,
    )


def _current_loop_id() -> int | None:
    try:
        return id(asyncio.get_running_loop())
    except RuntimeError:
        try:
            return id(asyncio.get_event_loop_policy().get_event_loop())
        except Exception:
            return None


def _get_client() -> AsyncIOMotorClient:
    global _client, _client_loop_id

    loop_id = _current_loop_id()
    stale_client = None
    with _client_lock:
        if _client is None or (loop_id is not None and _client_loop_id != loop_id):
            stale_client = _client
            _client = _create_client()
            _client_loop_id = loop_id
        client = _client

    if stale_client is not None:
        try:
            stale_client.close()
        except Exception:
            logger.debug("Failed to close stale MongoDB client", exc_info=True)
    return client


def close_database_client() -> None:
    global _client, _client_loop_id

    with _client_lock:
        client = _client
        _client = None
        _client_loop_id = None

    if client is not None:
        try:
            client.close()
        except Exception:
            logger.debug("Failed to close MongoDB client", exc_info=True)


class _DatabaseProxy:
    def __getattr__(self, name: str):
        return getattr(_get_client().get_default_database(), name)

    def __getitem__(self, name: str):
        return _get_client().get_default_database()[name]

    def __repr__(self) -> str:
        return repr(_get_client().get_default_database())


db = _DatabaseProxy()

DEFAULT_HISTORY_TTL_DAYS = 90


_USERNAME_INDEX_KEYS = [("username", ASCENDING)]
_USERNAME_NORMALIZED_INDEX_KEYS = [("username_normalized", ASCENDING)]
_EMAIL_INDEX_KEYS = [("email", ASCENDING)]
_EMAIL_NORMALIZED_INDEX_KEYS = [("email_normalized", ASCENDING)]
_GOOGLE_SUB_INDEX_KEYS = [("google_auth.sub", ASCENDING)]


def _maybe_object_id(value: str | ObjectId | None) -> ObjectId | None:
    if isinstance(value, ObjectId):
        return value
    try:
        return ObjectId(str(value))
    except Exception:
        return None


def _normalize_index_keys(raw_keys) -> list[tuple[str, int]]:
    if raw_keys is None:
        return []
    if isinstance(raw_keys, dict):
        return list(raw_keys.items())
    return [(field, direction) for field, direction in raw_keys]


def _is_equivalent_username_index(index_spec: dict) -> bool:
    return (
        _normalize_index_keys(index_spec.get("key")) == _USERNAME_INDEX_KEYS
        and bool(index_spec.get("unique"))
        and not index_spec.get("partialFilterExpression")
        and not index_spec.get("sparse")
        and not index_spec.get("expireAfterSeconds")
        and not index_spec.get("collation")
    )


async def _find_equivalent_username_index_name() -> str | None:
    indexes = await db.users.list_indexes().to_list(length=None)
    for index_spec in indexes:
        if _is_equivalent_username_index(index_spec):
            return str(index_spec.get("name") or "") or None
    return None


async def _ensure_users_indexes() -> None:
    existing_username_index = await _find_equivalent_username_index_name()
    if existing_username_index:
        logger.info(
            "Reusing existing users.username unique index '%s'",
            existing_username_index,
        )
    else:
        try:
            await db.users.create_index(_USERNAME_INDEX_KEYS, unique=True)
        except OperationFailure as exc:
            if getattr(exc, "code", None) != 85:
                raise
            existing_username_index = await _find_equivalent_username_index_name()
            if not existing_username_index:
                raise
            logger.info(
                "Detected equivalent users.username unique index '%s' after create conflict; reusing it",
                existing_username_index,
            )

    await db.users.create_index(_EMAIL_INDEX_KEYS, sparse=True)
    await db.users.create_index(
        _USERNAME_NORMALIZED_INDEX_KEYS,
        unique=True,
        partialFilterExpression={"username_normalized": {"$exists": True, "$type": "string"}},
    )
    await db.users.create_index(
        _EMAIL_NORMALIZED_INDEX_KEYS,
        unique=True,
        partialFilterExpression={"email_normalized": {"$exists": True, "$type": "string", "$gt": ""}},
    )
    await db.users.create_index(
        _GOOGLE_SUB_INDEX_KEYS,
        unique=True,
        partialFilterExpression={"google_auth.sub": {"$exists": True, "$type": "string", "$gt": ""}},
    )


async def _ensure_google_auth_ticket_indexes() -> None:
    await db.google_auth_tickets.create_indexes([
        IndexModel([("ticket_id", ASCENDING)], unique=True),
        IndexModel([("expires_at", ASCENDING)], expireAfterSeconds=_TTL_ON_FIELD),
    ])


async def _ensure_user_sessions_indexes() -> None:
    await db.user_sessions.create_indexes([
        IndexModel([("session_id", ASCENDING)], unique=True),
        IndexModel([("refresh_token_hash", ASCENDING)], unique=True),
        IndexModel([("refresh_jti", ASCENDING)], unique=True),
        IndexModel([("user_id", ASCENDING), ("last_seen_at", DESCENDING)]),
        IndexModel([("family_id", ASCENDING)]),
        IndexModel([("expires_at", ASCENDING)], expireAfterSeconds=_TTL_ON_FIELD),
    ])


async def _ensure_auth_security_indexes() -> None:
    await db.auth_attempt_counters.create_indexes([
        IndexModel([("scope_key", ASCENDING)], unique=True),
        IndexModel([("scope", ASCENDING), ("locked_until", DESCENDING)]),
        IndexModel([("expires_at", ASCENDING)], expireAfterSeconds=_TTL_ON_FIELD),
    ])
    await db.security_audit_events.create_indexes([
        IndexModel([("created_at", DESCENDING), ("user_id", ASCENDING)]),
        IndexModel([("action", ASCENDING), ("created_at", DESCENDING)]),
        IndexModel([("expires_at", ASCENDING)], expireAfterSeconds=_TTL_ON_FIELD),
    ])


async def compute_history_expires_at(user_id: str) -> datetime | None:
    """Return the ``expires_at`` datetime for a new history document based on
    the user's ``history_ttl_days`` setting.  Returns ``None`` when the user
    chose permanent storage (ttl == 0)."""
    user_oid = _maybe_object_id(user_id)
    if user_oid is None:
        return datetime.now(timezone.utc) + timedelta(days=DEFAULT_HISTORY_TTL_DAYS)
    user_doc = await db.users.find_one({"_id": user_oid}, {"history_ttl_days": 1})
    ttl = (user_doc or {}).get("history_ttl_days", DEFAULT_HISTORY_TTL_DAYS)
    if ttl == 0:
        return None
    return datetime.now(timezone.utc) + timedelta(days=ttl)


async def ensure_indexes() -> None:
    """Create recommended indexes for core collections. Safe to call repeatedly."""
    try:
        # ── core auth / domain ────────────────────────────────────────────────
        await _ensure_users_indexes()
        await _ensure_google_auth_ticket_indexes()
        await _ensure_user_sessions_indexes()
        await _ensure_auth_security_indexes()

        await db.login_mfa_challenges.create_indexes([
            IndexModel([("challenge_id", ASCENDING)], unique=True),
            IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("expires_at", ASCENDING)], expireAfterSeconds=_TTL_ON_FIELD),
        ])

        await db.annotations.create_indexes([
            IndexModel([("submissionId", ASCENDING)], unique=True),
        ])

        # ── v2 flat domain model ──────────────────────────────────────────────
        await db.course_sections.create_indexes([
            IndexModel([("courseCode", ASCENDING)]),
            IndexModel([("ownerTeacherId", ASCENDING)]),
            IndexModel([("ownerTeacherId", ASCENDING), ("semester", ASCENDING), ("courseCode", ASCENDING)]),
            IndexModel([("courseCode", ASCENDING), ("semester", ASCENDING)], unique=True),
        ])

        await db.enrollments.create_indexes([
            IndexModel([("courseSectionId", ASCENDING), ("userId", ASCENDING)], unique=True),
            IndexModel([("userId", ASCENDING), ("roleInCourse", ASCENDING), ("courseSectionId", ASCENDING)]),
        ])

        await db.assignments.create_indexes([
            IndexModel([("courseSectionId", ASCENDING), ("createdAt", DESCENDING)]),
            IndexModel([("courseSectionId", ASCENDING), ("dueAt", DESCENDING)]),
        ])

        await db.submissions.create_indexes([
            IndexModel([("assignmentId", ASCENDING), ("studentId", ASCENDING), ("attemptNo", ASCENDING)], unique=True),
            IndexModel([("assignmentId", ASCENDING), ("submittedAt", DESCENDING)]),
            IndexModel([("studentId", ASCENDING), ("submittedAt", DESCENDING)]),
            IndexModel([("status", ASCENDING), ("submittedAt", DESCENDING)]),
        ])

        await db.documents.create_indexes([
            IndexModel([("ownerId", ASCENDING), ("sourceType", ASCENDING)]),
        ])

        await db.grades.create_indexes([
            IndexModel([("submissionId", ASCENDING)], unique=True),
            IndexModel([("graderId", ASCENDING), ("gradedAt", DESCENDING)]),
        ])

        # legacy courses collection (kept for backward compat during migration)
        await db.courses.create_indexes([
            IndexModel([("courseId", ASCENDING)]),
        ])

        # ── telemetry ─────────────────────────────────────────────────────────
        await db.llm_telemetry.create_indexes([
            IndexModel([("timestamp", DESCENDING), ("provider", ASCENDING)]),
            IndexModel([("timestamp", DESCENDING), ("endpoint", ASCENDING)]),
            IndexModel([("success", ASCENDING), ("timestamp", DESCENDING)]),
            IndexModel([("api_type", ASCENDING), ("timestamp", DESCENDING)]),
            # TTL: auto-delete records older than 90 days
            IndexModel([("timestamp", ASCENDING)], expireAfterSeconds=_TTL_90D),
        ])

        # ── sub1 task tracking ────────────────────────────────────────────────
        await db.sub1_task_tracking.create_indexes([
            IndexModel([("request_id", ASCENDING)], unique=True),
            IndexModel([("created_at", DESCENDING), ("task_type", ASCENDING)]),
            IndexModel([("status", ASCENDING), ("created_at", DESCENDING)]),
            # TTL: auto-delete records older than 30 days
            IndexModel([("created_at", ASCENDING)], expireAfterSeconds=_TTL_30D),
        ])

        # ── sub1 checkpoints ──────────────────────────────────────────────────
        await db.sub1_checkpoints.create_indexes([
            IndexModel([("task_id", ASCENDING), ("step", ASCENDING)], unique=True),
            IndexModel([("step", ASCENDING), ("input_hash", ASCENDING)]),
            # TTL: expire when document's own expires_at is reached
            IndexModel([("expires_at", ASCENDING)], expireAfterSeconds=_TTL_ON_FIELD),
        ])

        # ── sub1 audit log ────────────────────────────────────────────────────
        await db.sub1_audit_log.create_indexes([
            IndexModel([("timestamp", DESCENDING), ("user_id", ASCENDING)]),
            # TTL: auto-delete records older than 90 days
            IndexModel([("timestamp", ASCENDING)], expireAfterSeconds=_TTL_90D),
        ])

        # ── generation history (sub1-5 + video share identical structure) ─────
        for _col in _GEN_HISTORY_COLS:
            await db[_col].create_indexes([
                IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)]),
                # TTL: per-user configurable, expire on expires_at field
                IndexModel([("expires_at", ASCENDING)], expireAfterSeconds=_TTL_ON_FIELD),
            ])

        # ── chat contacts / rooms / messages ──────────────────────────────────
        await db.chat_contacts.create_indexes([
            IndexModel([("userId", ASCENDING), ("contactId", ASCENDING)], unique=True),
            IndexModel([("userId", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("contactId", ASCENDING), ("status", ASCENDING)]),
        ])

        # Drop stale index name before re-creating with correct definition
        try:
            await db.chat_rooms.drop_index("courseId_1_type_1")
        except Exception:
            pass  # index may not exist yet — safe to ignore

        await db.chat_rooms.create_indexes([
            IndexModel([("members", ASCENDING)]),
            IndexModel([("members", ASCENDING), ("createdAt", DESCENDING)]),
            # Unique: prevents duplicate course group rooms
            IndexModel(
                [("courseId", ASCENDING), ("type", ASCENDING)],
                unique=True,
                partialFilterExpression={"courseId": {"$exists": True}},
            ),
            # Unique: prevents duplicate DM rooms
            IndexModel(
                [("directPairKey", ASCENDING)],
                unique=True,
                partialFilterExpression={"directPairKey": {"$exists": True}},
            ),
        ])

        await db.chat_messages.create_indexes([
            IndexModel([("roomId", ASCENDING), ("sentAt", DESCENDING)]),
            IndexModel([("roomId", ASCENDING), ("readBy", ASCENDING), ("senderId", ASCENDING)]),
        ])

        # ── AI chat sessions ──────────────────────────────────────────────────
        # Remove legacy TTL index so sessions are kept permanently
        try:
            await db.ai_chat_sessions.drop_index("updatedAt_1")
        except Exception:
            pass

        await db.ai_chat_sessions.create_indexes([
            IndexModel([("userId", ASCENDING), ("updatedAt", DESCENDING)]),
            IndexModel([("userId", ASCENDING), ("createdAt", DESCENDING)]),
            IndexModel([("updatedAt", ASCENDING)]),
        ])

        # ── staff codes ───────────────────────────────────────────────────────
        await db.staff_codes.create_indexes([
            IndexModel([("code", ASCENDING)], unique=True),
            IndexModel([("is_used", ASCENDING)]),
            # TTL: expire on expires_at field value
            IndexModel([("expires_at", ASCENDING)], expireAfterSeconds=_TTL_ON_FIELD),
        ])

        # ── chat AI jobs ──────────────────────────────────────────────────────
        await db.chat_ai_jobs.create_indexes([
            IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("room_id", ASCENDING), ("created_at", DESCENDING)]),
            # TTL: auto-delete records older than 90 days
            IndexModel([("created_at", ASCENDING)], expireAfterSeconds=_TTL_90D),
        ])

        # ── chat file transfers ───────────────────────────────────────────────
        await db.chat_file_transfers.create_indexes([
            IndexModel([("transfer_id", ASCENDING)], unique=True),
            IndexModel([("owner_user_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("status", ASCENDING), ("expires_at", ASCENDING)]),
            IndexModel([("source_room_id", ASCENDING), ("created_at", DESCENDING)]),
            # TTL: auto-delete 7 days past expiry
            IndexModel([("expires_at", ASCENDING)], expireAfterSeconds=_TTL_7D),
        ])

        # ── knowledge indexing jobs ───────────────────────────────────────────
        await db.indexing_jobs.create_indexes([
            IndexModel([("job_id", ASCENDING)], unique=True),
            IndexModel([("course_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("course_id", ASCENDING), ("filename", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("course_id", ASCENDING), ("normalized_hash", ASCENDING), ("status", ASCENDING)]),
            # TTL: auto-delete records older than 180 days
            IndexModel([("created_at", ASCENDING)], expireAfterSeconds=_TTL_180D),
        ])

        # persistent background jobs (bridge toward claim-based worker execution)
        await db.background_jobs.create_indexes([
            IndexModel([("job_id", ASCENDING)], unique=True),
            IndexModel([("job_type", ASCENDING), ("status", ASCENDING), ("available_at", ASCENDING)]),
            IndexModel([("status", ASCENDING), ("lease_expires_at", ASCENDING)]),
            # TTL: auto-delete records older than 30 days
            IndexModel([("created_at", ASCENDING)], expireAfterSeconds=_TTL_30D),
        ])
        # ── file assets registry ──────────────────────────────────────────────
        await db.file_assets.create_indexes([
            IndexModel([("file_id", ASCENDING)], unique=True),
            IndexModel([("file_type", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("owner_type", ASCENDING), ("owner_id", ASCENDING)]),
            IndexModel([("course_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("scope", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("room_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("user_id", ASCENDING), ("scope", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("session_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("conversation_date", ASCENDING), ("user_id", ASCENDING), ("created_at", DESCENDING)]),
        ])

        # ── question ops runs / items ─────────────────────────────────────────
        await db.password_reset_tokens.create_indexes([
            IndexModel([("token_hash", ASCENDING)], unique=True),
            IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("expires_at", ASCENDING)], expireAfterSeconds=_TTL_ON_FIELD),
        ])

        await db.question_ops_runs.create_indexes([
            IndexModel([("run_id", ASCENDING)], unique=True),
            IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)]),
            # TTL: auto-delete records older than 90 days
            IndexModel([("created_at", ASCENDING)], expireAfterSeconds=_TTL_90D),
        ])

        await db.question_ops_items.create_indexes([
            IndexModel([("run_id", ASCENDING), ("item_id", ASCENDING)], unique=True),
            IndexModel([("run_id", ASCENDING), ("quality_score", DESCENDING)]),
        ])

        # ── slides delivery jobs ──────────────────────────────────────────────
        await db.slides_delivery_jobs.create_indexes([
            IndexModel([("job_id", ASCENDING)], unique=True),
            IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)]),
            # TTL: auto-delete records older than 30 days
            IndexModel([("created_at", ASCENDING)], expireAfterSeconds=_TTL_30D),
        ])

        # ── study plan + review queue ─────────────────────────────────────────
        await db.study_plan_profiles.create_indexes([
            IndexModel([("plan_id", ASCENDING)], unique=True),
            IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)]),
        ])

        await db.study_review_queue.create_indexes([
            IndexModel([("plan_id", ASCENDING), ("queue_id", ASCENDING)], unique=True),
            IndexModel([("user_id", ASCENDING), ("due_at", ASCENDING), ("status", ASCENDING)]),
        ])

        # ── AI session buckets (Bucket Pattern for large sessions) ────────────
        await db.ai_session_buckets.create_indexes([
            IndexModel([("sessionId", ASCENDING), ("bucketIndex", ASCENDING)], unique=True),
        ])

        logger.info("MongoDB indexes ensured successfully")
    except Exception:
        logger.exception("Failed to create some MongoDB indexes")


async def check_health() -> dict:
    """Quick health check for MongoDB connectivity."""
    try:
        result = await db.command("ping")
        return {"status": "ok", "ping": result}
    except Exception as exc:
        return {"status": "error", "error": str(exc)}
