import logging
from motor.motor_asyncio import AsyncIOMotorClient
from backend.config import Config

logger = logging.getLogger(__name__)

client = AsyncIOMotorClient(
    Config.MONGO_URI,
    maxPoolSize=50,
    minPoolSize=5,
    serverSelectionTimeoutMS=5000,
    connectTimeoutMS=5000,
    socketTimeoutMS=30000,
)
db = client.get_default_database()


async def ensure_indexes() -> None:
    """Create recommended indexes for core collections. Safe to call repeatedly."""
    try:
        await db.users.create_index("username", unique=True, background=True)
        await db.users.create_index("email", sparse=True, background=True)

        await db.annotations.create_index("submissionId", unique=True, background=True)

        # --- v2 flat domain model collections ---
        await db.course_sections.create_index("courseCode", background=True)
        await db.course_sections.create_index("ownerTeacherId", background=True)
        await db.course_sections.create_index(
            [("courseCode", 1), ("semester", 1)],
            background=True,
        )

        await db.enrollments.create_index(
            [("courseSectionId", 1), ("userId", 1)],
            unique=True,
            background=True,
        )
        await db.enrollments.create_index("userId", background=True)

        await db.assignments.create_index("courseSectionId", background=True)
        await db.assignments.create_index(
            [("courseSectionId", 1), ("dueAt", -1)],
            background=True,
        )

        await db.submissions.create_index(
            [("assignmentId", 1), ("studentId", 1)],
            background=True,
        )
        await db.submissions.create_index("studentId", background=True)
        await db.submissions.create_index(
            [("status", 1), ("submittedAt", -1)],
            background=True,
        )

        await db.documents.create_index(
            [("ownerId", 1), ("sourceType", 1)],
            background=True,
        )

        await db.grades.create_index("submissionId", background=True)
        await db.grades.create_index(
            [("graderId", 1), ("gradedAt", -1)],
            background=True,
        )

        # --- legacy courses collection (kept for backward compat during migration) ---
        await db.courses.create_index("courseId", background=True)

        await db.llm_telemetry.create_index(
            [("timestamp", -1), ("provider", 1)],
            background=True,
        )
        # TTL index: auto-delete telemetry records older than 90 days
        await db.llm_telemetry.create_index(
            "timestamp",
            expireAfterSeconds=90 * 24 * 3600,
            background=True,
        )
        # v2 telemetry indexes for new aggregation queries
        await db.llm_telemetry.create_index(
            [("timestamp", -1), ("endpoint", 1)],
            background=True,
        )
        await db.llm_telemetry.create_index(
            [("success", 1), ("timestamp", -1)],
            background=True,
        )
        await db.llm_telemetry.create_index(
            [("api_type", 1), ("timestamp", -1)],
            background=True,
        )

        # Sub1 task tracking indexes
        await db.sub1_task_tracking.create_index("request_id", unique=True, background=True)
        await db.sub1_task_tracking.create_index(
            [("created_at", -1), ("task_type", 1)],
            background=True,
        )
        await db.sub1_task_tracking.create_index(
            [("status", 1), ("created_at", -1)],
            background=True,
        )
        # TTL: auto-delete task records older than 30 days
        await db.sub1_task_tracking.create_index(
            "created_at",
            expireAfterSeconds=30 * 24 * 3600,
            background=True,
        )

        # Sub1 checkpoint indexes
        await db.sub1_checkpoints.create_index(
            [("task_id", 1), ("step", 1)],
            unique=True,
            background=True,
        )
        await db.sub1_checkpoints.create_index(
            [("step", 1), ("input_hash", 1)],
            background=True,
        )
        # TTL: auto-delete expired checkpoints
        await db.sub1_checkpoints.create_index(
            "expires_at",
            expireAfterSeconds=0,
            background=True,
        )

        # Sub1 audit log index
        await db.sub1_audit_log.create_index(
            [("timestamp", -1), ("user_id", 1)],
            background=True,
        )
        # TTL: auto-delete audit logs older than 90 days
        await db.sub1_audit_log.create_index(
            "timestamp",
            expireAfterSeconds=90 * 24 * 3600,
            background=True,
        )

        # Sub2 generation history indexes
        await db.sub2_generation_history.create_index(
            [("user_id", 1), ("created_at", -1)],
            background=True,
        )
        # TTL: auto-delete generation history older than 90 days
        await db.sub2_generation_history.create_index(
            "created_at",
            expireAfterSeconds=90 * 24 * 3600,
            background=True,
        )

        # Email classification cache indexes
        await db.email_classifications.create_index("messageId", unique=True, background=True)
        # TTL: auto-delete classification cache after 7 days
        await db.email_classifications.create_index(
            "cachedAt",
            expireAfterSeconds=7 * 24 * 3600,
            background=True,
        )

        # --- Chat feature (contacts, rooms, messages) ---
        await db.chat_contacts.create_index(
            [("userId", 1), ("contactId", 1)], unique=True, background=True,
        )
        await db.chat_contacts.create_index(
            [("userId", 1), ("status", 1)], background=True,
        )
        await db.chat_contacts.create_index(
            [("contactId", 1), ("status", 1)], background=True,
        )
        await db.chat_rooms.create_index("members", background=True)
        await db.chat_rooms.create_index(
            [("members", 1), ("createdAt", -1)], background=True,
        )
        await db.chat_rooms.create_index(
            [("courseId", 1), ("type", 1)], background=True,
        )
        await db.chat_messages.create_index(
            [("roomId", 1), ("sentAt", -1)], background=True,
        )
        await db.chat_messages.create_index(
            [("roomId", 1), ("readBy", 1), ("senderId", 1)], background=True,
        )

        # --- AI Chat Sessions ---
        await db.ai_chat_sessions.create_index(
            [("userId", 1), ("updatedAt", -1)],
            background=True,
        )
        # TTL: auto-delete sessions not updated for 180 days
        await db.ai_chat_sessions.create_index(
            "updatedAt",
            expireAfterSeconds=180 * 24 * 3600,
            background=True,
        )

        # --- Staff codes (one-time teacher registration codes) ---
        await db.staff_codes.create_index("code", unique=True, background=True)
        await db.staff_codes.create_index("is_used", background=True)
        # TTL: auto-delete expired codes
        await db.staff_codes.create_index(
            "expires_at",
            expireAfterSeconds=0,
            background=True,
        )

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