from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class AdminSecurityUnlockSchema(BaseModel):
    scope_key: str = Field(min_length=8, max_length=256)


class AdminUserStatusUpdateSchema(BaseModel):
    status: Literal["active", "disabled", "suspended"]
