"""Diagram AI provider status endpoint."""

from fastapi import Depends

from backend.core.ai_provider import list_provider_statuses
from backend.core.security import get_current_user

from .router import diagram_router


@diagram_router.get("/providers")
async def get_diagram_providers(user: dict = Depends(get_current_user)):
    statuses = await list_provider_statuses(user=user, feature="diagram.providers")
    return {"providers": [item.public_dict() for item in statuses]}
