from typing import Literal, List, Optional

from pydantic import BaseModel


class SearchSvgSchema(BaseModel):
    provider: Optional[Literal['coze', 'local_ollama']] = 'local_ollama'
    prompt: str

class DownloadSvgSchema(BaseModel):
    provider: Optional[Literal['coze', 'local_ollama']] = 'local_ollama'
    svg: str
