from __future__ import annotations

from importlib import import_module
from typing import TYPE_CHECKING, Any

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

_EXPORTS: dict[str, tuple[str, str]] = {
    "PPTCreator": (".output.ppt_creator", "PPTCreator"),
    "PPTTemplateManager": (".output.list_placeholders", "PPTTemplateManager"),
    "generate_talking_script_word": (".output.word_generator", "generate_talking_script_word"),
    "MarkdownViewer": (".parsing.md_parser", "MarkdownViewer"),
    "ChapterSummarizer": (".generation.chapter_summarizer", "ChapterSummarizer"),
    "TaskTracker": (".infra.task_tracker", "TaskTracker"),
    "StepStatus": (".infra.task_tracker", "StepStatus"),
    "TaskStatus": (".infra.task_tracker", "TaskStatus"),
    "StepRecord": (".infra.task_tracker", "StepRecord"),
    "ErrorCategory": (".infra.task_tracker", "ErrorCategory"),
    "AuditLogger": (".infra.audit_logger", "AuditLogger"),
    "PresentonAdapterService": (".presenton.adapter_service", "PresentonAdapterService"),
    "PresentonTaskService": (".presenton.task_service", "PresentonTaskService"),
}

if TYPE_CHECKING:
    from .generation.chapter_summarizer import ChapterSummarizer
    from .infra.audit_logger import AuditLogger
    from .infra.task_tracker import ErrorCategory, StepRecord, StepStatus, TaskStatus, TaskTracker
    from .output.list_placeholders import PPTTemplateManager
    from .output.ppt_creator import PPTCreator
    from .output.word_generator import generate_talking_script_word
    from .parsing.md_parser import MarkdownViewer
    from .presenton.adapter_service import PresentonAdapterService
    from .presenton.task_service import PresentonTaskService


def __getattr__(name: str) -> Any:
    target = _EXPORTS.get(name)
    if target is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module_name, attr_name = target
    value = getattr(import_module(module_name, __name__), attr_name)
    globals()[name] = value
    return value


def __dir__() -> list[str]:
    return sorted(set(globals()) | set(__all__))
