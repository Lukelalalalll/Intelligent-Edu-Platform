import logging
from datetime import datetime, timedelta, timezone

from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

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

client = AsyncIOMotorClient(
    Config.MONGO_URI,
    maxPoolSize=50,
    minPoolSize=5,
    serverSelectionTimeoutMS=5000,
    connectTimeoutMS=5000,
    socketTimeoutMS=30000,
)
db = client.get_default_database()

DEFAULT_HISTORY_TTL_DAYS = 90


async def compute_history_expires_at(user_id: str) -> datetime | None:
    """Return the ``expires_at`` datetime for a new history document based on
    the user's ``history_ttl_days`` setting.  Returns ``None`` when the user
    chose permanent storage (ttl == 0)."""
    user_doc = await db.users.find_one({"_id": user_id}, {"history_ttl_days": 1})
    ttl = (user_doc or {}).get("history_ttl_days", DEFAULT_HISTORY_TTL_DAYS)
    if ttl == 0:
        return None
    return datetime.now(timezone.utc) + timedelta(days=ttl)


async def ensure_indexes() -> None:
    """Create recommended indexes for core collections. Safe to call repeatedly."""
    try:
        # ── core auth / domain ────────────────────────────────────────────────
        await db.users.create_indexes([
            IndexModel([("username", ASCENDING)], unique=True),
            IndexModel([("email", ASCENDING)], sparse=True),
        ])

        await db.annotations.create_indexes([
            IndexModel([("submissionId", ASCENDING)], unique=True),
        ])

        # ── v2 flat domain model ──────────────────────────────────────────────
        await db.course_sections.create_indexes([
            IndexModel([("courseCode", ASCENDING)]),
            IndexModel([("ownerTeacherId", ASCENDING)]),
            IndexModel([("courseCode", ASCENDING), ("semester", ASCENDING)]),
        ])

        await db.enrollments.create_indexes([
            IndexModel([("courseSectionId", ASCENDING), ("userId", ASCENDING)], unique=True),
            IndexModel([("userId", ASCENDING)]),
        ])

        await db.assignments.create_indexes([
            IndexModel([("courseSectionId", ASCENDING)]),
            IndexModel([("courseSectionId", ASCENDING), ("dueAt", DESCENDING)]),
        ])

        await db.submissions.create_indexes([
            IndexModel([("assignmentId", ASCENDING), ("studentId", ASCENDING)]),
            IndexModel([("studentId", ASCENDING)]),
            IndexModel([("status", ASCENDING), ("submittedAt", DESCENDING)]),
        ])

        await db.documents.create_indexes([
            IndexModel([("ownerId", ASCENDING), ("sourceType", ASCENDING)]),
        ])

        await db.grades.create_indexes([
            IndexModel([("submissionId", ASCENDING)]),
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
            # TTL: auto-delete records older than 180 days
            IndexModel([("created_at", ASCENDING)], expireAfterSeconds=_TTL_180D),
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