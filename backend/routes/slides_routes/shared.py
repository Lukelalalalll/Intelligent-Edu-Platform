from __future__ import annotations

from typing import Optional

from pydantic import BaseModel

THEME_NAMES = {
    "minimalist": "Minimalist (Academic)",
    "neon_tech": "Neon Tech",
    "corporate": "Corporate Blue",
}


class CozeOutlineRequest(BaseModel):
    provider: Optional[str] = "local_ollama"
    keywords: str


class ProcessTextRequest(BaseModel):
    text: str
    title: str
