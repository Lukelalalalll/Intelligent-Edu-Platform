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