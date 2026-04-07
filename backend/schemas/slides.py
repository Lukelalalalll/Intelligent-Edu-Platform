from typing import List, Optional

from pydantic import BaseModel


class CombineSchema(BaseModel):
    filename: str
    selected_indices: List[int]
    use_llm: bool = False

class SaveHighlightsSchema(BaseModel):
    filename: str
    highlights: List[dict]

class SummarizeRequestSchema(BaseModel):
    highlights: List[dict]
    num_of_bullets: int = 3
    words_each_bullet: int = 15

class ClassifyHighlightsSchema(BaseModel):
    highlights: List[dict]

class BatchHighlightActionSchema(BaseModel):
    action: str  # 'keep' or 'remove'
    category: Optional[str] = None
    min_confidence: Optional[float] = None
    highlight_ids: Optional[List[str]] = None

class GenerateScriptSchema(BaseModel):
    slides_results: List[dict]
    script_style: str = "academic"
    presentation_title: str = ""
    generate_word: bool = True

class MapToSlidesSchema(BaseModel):
    summaries: List[dict]
    available_layouts: Optional[List[str]] = None
    start_number: int = 1

class ValidateSlidesSchema(BaseModel):
    slides: List[dict]

class EvaluateQualitySchema(BaseModel):
    highlights: List[dict] = []
    slides: List[dict]

class SummarizeChaptersSchema(BaseModel):
    chapterData: List[dict]
    total_pages: int
    num_of_bullets: int
    words_each_bullet: int

class PptProcessSchema(BaseModel):
    ppt_schema: dict
