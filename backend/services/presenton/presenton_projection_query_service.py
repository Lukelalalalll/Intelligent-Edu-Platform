from __future__ import annotations

from backend.services.presenton.presenton_sql_query_service import (
    PRESENTON_SQL_QUERY_SERVICE,
)


class PresentonProjectionQueryService:
    """Compatibility shim that now reads Presenton data from SQL."""

    async def list_presentations(
        self,
        *,
        owner_user_id: str,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[dict], int]:
        return await PRESENTON_SQL_QUERY_SERVICE.list_presentations(
            owner_user_id=owner_user_id,
            page=page,
            page_size=page_size,
        )

    async def get_presentation_detail(
        self,
        *,
        owner_user_id: str,
        presentation_id: str,
    ) -> dict | None:
        return await PRESENTON_SQL_QUERY_SERVICE.get_presentation_detail(
            owner_user_id=owner_user_id,
            presentation_id=presentation_id,
        )

    async def search_presentations(
        self,
        *,
        owner_user_id: str,
        query: str,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[dict], int]:
        return await PRESENTON_SQL_QUERY_SERVICE.search_presentations(
            owner_user_id=owner_user_id,
            query=query,
            page=page,
            page_size=page_size,
        )


PRESENTON_PROJECTION_QUERY_SERVICE = PresentonProjectionQueryService()
PptGeneratorProjectionQueryService = PresentonProjectionQueryService
PPT_GENERATOR_PROJECTION_QUERY_SERVICE = PRESENTON_PROJECTION_QUERY_SERVICE
