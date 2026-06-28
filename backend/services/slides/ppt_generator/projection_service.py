from __future__ import annotations

class _NoopProjectionService:
    async def safe_sync_presentation_bundle(self, *args, **kwargs):
        return {
            "disabled": True,
            "reason": "mongo_projection_retired",
            "action": "safe_sync_presentation_bundle",
        }

    async def safe_sync_chat_conversation(self, *args, **kwargs):
        return {
            "disabled": True,
            "reason": "mongo_projection_retired",
            "action": "safe_sync_chat_conversation",
        }

    async def safe_delete_projection(self, *args, **kwargs):
        return {
            "disabled": True,
            "reason": "mongo_projection_retired",
            "action": "safe_delete_projection",
        }


PPT_GENERATOR_MONGO_PROJECTION_SERVICE = _NoopProjectionService()

__all__ = ["PPT_GENERATOR_MONGO_PROJECTION_SERVICE"]
