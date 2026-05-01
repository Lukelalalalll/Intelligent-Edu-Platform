from typing import Literal, List, Optional

from pydantic import BaseModel


class CombineSchema(BaseModel):
    filename: str
    selected_indices: List[int]
    use_llm: bool = False
    header_llm_provider: Optional[Literal['local_ollama', 'coze']] = 'local_ollama'

class SaveHighlightsSchema(BaseModel):
    filename: str
    highlights: List[dict]

class SummarizeRequestSchema(BaseModel):
    provider: Optional[Literal['coze', 'local_ollama']] = 'local_ollama'
    highlights: List[dict]
    num_of_bullets: int = 3
    words_each_bullet: int = 15

class ClassifyHighlightsSchema(BaseModel):
    provider: Optional[Literal['coze', 'local_ollama']] = 'local_ollama'
    highlights: List[dict]

class BatchHighlightActionSchema(BaseModel):
    action: str  # 'keep' or 'remove'
    category: Optional[str] = None
    min_confidence: Optional[float] = None
    highlight_ids: Optional[List[str]] = None

class GenerateScriptSchema(BaseModel):
    provider: Optional[Literal['coze', 'local_ollama']] = 'local_ollama'
    slides_results: List[dict]
    script_style: str = "academic"
    presentation_title: str = ""
    generate_word: bool = True

class MapToSlidesSchema(BaseModel):
    provider: Optional[Literal['coze', 'local_ollama']] = 'local_ollama'
    summaries: List[dict]
    available_layouts: Optional[List[str]] = None
    start_number: int = 1

class ValidateSlidesSchema(BaseModel):
    provider: Optional[Literal['coze', 'local_ollama']] = 'local_ollama'
    slides: List[dict]

class EvaluateQualitySchema(BaseModel):
    provider: Optional[Literal['coze', 'local_ollama']] = 'local_ollama'
    highlights: List[dict] = []
    slides: List[dict]

class SummarizeChaptersSchema(BaseModel):
    provider: Optional[Literal['coze', 'local_ollama']] = 'local_ollama'
    chapterData: List[dict]
    total_pages: int
    num_of_bullets: int
    words_each_bullet: int

class PptProcessSchema(BaseModel):
    provider: Optional[Literal['coze', 'local_ollama']] = 'local_ollama'
    ppt_schema: dict


class SlidesGenerateV2Schema(BaseModel):
    provider: Optional[Literal['coze', 'local_ollama']] = None
    content: str = ""
    chapterData: List[dict] = []
    total_pages: int = 8
    num_of_bullets: int = 3
    words_each_bullet: int = 15
    presentation_title: str = ""
    script_style: str = "academic"
    generate_talking_script: bool = False
    generate_word_document: bool = True


class SlidesTaskResponseSchema(BaseModel):
    success: bool = True
    task_id: str
    status: Literal['queued', 'running', 'completed', 'failed']
    request_id: str


class SlidesTaskStatusSchema(BaseModel):
    success: bool = True
    task_id: str
    status: Literal['queued', 'running', 'completed', 'failed']
    current_step: str = ""
    progress: int = 0
    request_id: str
    result: Optional[dict] = None
    error: str = ""
    events: List[dict] = []
