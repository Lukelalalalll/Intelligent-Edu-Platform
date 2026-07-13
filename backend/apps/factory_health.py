from __future__ import annotations

from fastapi import APIRouter, FastAPI


def build_health_router() -> APIRouter:
    router = APIRouter(tags=["System"])

    @router.get("/health")
    async def health_check():
        from backend.core.database import check_health
        from backend.core.opensearch_client import check_opensearch_health

        db_health = await check_health()
        opensearch_health = check_opensearch_health()
        return {
            "status": (
                "ok"
                if db_health.get("status") == "ok"
                and opensearch_health.get("status") in {"ok", "disabled"}
                else "degraded"
            ),
            "database": db_health,
            "opensearch": opensearch_health,
        }

    return router


def register_health_endpoints(app: FastAPI) -> None:
    @app.get("/healthz", include_in_schema=False)
    async def healthz():
        return {"status": "ok"}

    @app.get("/internal/health", include_in_schema=False)
    async def internal_health():
        from backend.core.database import check_health
        from backend.core.opensearch_client import check_opensearch_health

        return {
            "status": "ok",
            "database": await check_health(),
            "opensearch": check_opensearch_health(),
        }
