from typing import Literal, List, Optional

from pydantic import BaseModel

from backend.core.ai_provider import AIProvider


class SearchSvgSchema(BaseModel):
    provider: Optional[AIProvider] = 'local_ollama'
    prompt: str

class DownloadSvgSchema(BaseModel):
    provider: Optional[AIProvider] = 'local_ollama'
    svg: str