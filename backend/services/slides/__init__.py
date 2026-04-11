# Public API for backend.services.slides
# Consumers can import directly from this package without knowing subdirectory layout.

from .output.ppt_creator import PPTCreator
from .output.list_placeholders import PPTTemplateManager
from .output.word_generator import generate_talking_script_word
from .parsing.md_parser import MarkdownViewer
from .generation.chapter_summarizer import ChapterSummarizer
from .infra.task_tracker import TaskTracker, StepStatus, TaskStatus, StepRecord, ErrorCategory
from .infra.audit_logger import AuditLogger
from .presenton.adapter_service import PresentonAdapterService
from .presenton.task_service import PresentonTaskService

__all__ = [
    "PPTCreator",
    "PPTTemplateManager",
    "generate_talking_script_word",
    "MarkdownViewer",
    "ChapterSummarizer",
    "TaskTracker",
    "StepStatus",
    "TaskStatus",
    "StepRecord",
    "ErrorCategory",
    "AuditLogger",
    "PresentonAdapterService",
    "PresentonTaskService",
]
