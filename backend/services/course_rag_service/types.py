"""Shared types for the course RAG service."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class CourseChunk:
    course_id: str
    text: str
    score: float
    doc_name: str = ""
    page_num: int = -1
