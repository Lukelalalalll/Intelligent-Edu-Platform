from __future__ import annotations

from ...generation.img_chart_processor import ImageChartProcessor
from ..batch_context import BatchContext
from .. import ppt_utils
from .charts import LatexRenderer
from .presentation_builder import PresentationBuilderMixin
from .placeholder_processing import PlaceholderProcessingMixin
from .visual_batching import VisualBatchingMixin
from .notes_latex import NotesLatexMixin
from ..text_layout_engine import (
    clean_bullets,
    fit_font_size,
    log_slide_layout_audit,
    shape_dimensions_pt,
)


class PPTCreator(
    PresentationBuilderMixin,
    PlaceholderProcessingMixin,
    VisualBatchingMixin,
    NotesLatexMixin,
):
    LatexRenderer = LatexRenderer
    ppt_utils = ppt_utils
    fit_font_size = staticmethod(fit_font_size)
    clean_bullets = staticmethod(clean_bullets)
    shape_dimensions_pt = staticmethod(shape_dimensions_pt)
    log_slide_layout_audit = staticmethod(log_slide_layout_audit)

    def __init__(self, template_base_path=None):
        self.template_base_path = template_base_path or "static/ppt_templates"
        self.image_processor = ImageChartProcessor()
        self._ctx = BatchContext(
            template_base_path=self.template_base_path,
            image_processor=self.image_processor,
        )
        self.collected_tasks = self._ctx.collected_tasks
        self.is_collecting = self._ctx.is_collecting
        self.batch_results = self._ctx.batch_results
