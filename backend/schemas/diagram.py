from typing import List, Optional

from pydantic import BaseModel


class SearchSvgSchema(BaseModel):
    prompt: str

class DownloadSvgSchema(BaseModel):
    svg: str
