from __future__ import annotations

from backend.services.presenton.presenton_projection_query_service import (
    PRESENTON_PROJECTION_QUERY_SERVICE as _PROJECTION_QUERY_SERVICE,
)


async def search_ppt_generator_presentations(
    *,
    owner_user_id: str,
    query: str,
    page: int,
    page_size: int,
):
    return await _PROJECTION_QUERY_SERVICE.search_presentations(
        owner_user_id=owner_user_id,
        query=query,
        page=page,
        page_size=page_size,
    )


async def list_ppt_generator_presentations(
    *,
    owner_user_id: str,
    page: int,
    page_size: int,
):
    return await _PROJECTION_QUERY_SERVICE.list_presentations(
        owner_user_id=owner_user_id,
        page=page,
        page_size=page_size,
    )


async def get_ppt_generator_presentation_detail(
    *,
    owner_user_id: str,
    presentation_id: str,
):
    return await _PROJECTION_QUERY_SERVICE.get_presentation_detail(
        owner_user_id=owner_user_id,
        presentation_id=presentation_id,
    )
