"""BatchContext — holds mutable state for the PPT batch image pipeline."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List

from ..generation.img_chart_processor import ImageChartProcessor


@dataclass
class BatchContext:
    """Encapsulates all mutable state required during PPT generation.

    Previously these fields lived directly on the PPTCreator instance.
    Extracting them into a dataclass makes the batch pipeline testable
    independently and paves the way for fully functional (class-free) creation.
    """

    template_base_path: str = "static/ppt_templates"
    image_processor: ImageChartProcessor = field(default_factory=ImageChartProcessor)

    # Batch collection queue
    is_collecting: bool = False
    collected_tasks: List[Dict[str, Any]] = field(default_factory=list)
    batch_results: List[Any] = field(default_factory=list)

    # ── Batch lifecycle ────────────────────────────────────────────────

    def start_collecting(self) -> None:
        self.collected_tasks = []
        self.is_collecting = True
        self.batch_results = []
        print("🔄 [Batch Processing] Started collecting image placeholder tasks...")

    def stop_collecting(self) -> None:
        self.is_collecting = False
        print(f"⏹️ [Batch Processing] Stopped collecting. Total collected tasks: {len(self.collected_tasks)}")

    def enqueue(self, task_info: Dict[str, Any]) -> None:
        """Add a visual-generation task to the queue (only while collecting)."""
        self.collected_tasks.append(task_info)
