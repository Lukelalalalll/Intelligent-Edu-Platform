from ..business import (
    BusinessContentProcessor,
    BusinessImageProcessor,
    BusinessLatexProcessor,
    BusinessLayoutManager,
    BusinessPlaceholderProcessor,
    BusinessSectionHandler,
    BusinessSlideNumberHandler,
    BusinessSubtitleGenerator,
    BusinessTableHandler,
)
from .business_ppt_creator_support.content_mapping import (
    process_dynamic_layout_content,
)
from .business_ppt_creator_support.layout_selection import (
    find_layout_by_name,
    get_template_path,
)
from .business_ppt_creator_support.placeholder_processing import (
    process_business_placeholders,
)
from .business_ppt_creator_support.render_pipeline import create_presentation
from .ppt_creator import PPTCreator


class BusinessPPTCreator(PPTCreator):
    """Business模板专属的PPT创建器"""

    def __init__(self, template_base_path=None):
        super().__init__(template_base_path)
        self.template_name = "Business"
        self.content_processor = BusinessContentProcessor()
        self.section_handler = BusinessSectionHandler()
        self.layout_manager = BusinessLayoutManager()
        self.table_handler = BusinessTableHandler()
        self.placeholder_processor = BusinessPlaceholderProcessor()
        self.image_processor = BusinessImageProcessor()
        self.subtitle_generator = BusinessSubtitleGenerator()
        self.slide_number_handler = BusinessSlideNumberHandler()
        self.latex_processor = BusinessLatexProcessor()

    def _get_template_path(self, theme):
        return get_template_path(self, theme)

    def _find_layout_by_name(self, prs, layout_name):
        return find_layout_by_name(self, prs, layout_name)

    def _process_dynamic_layout_content(
        self,
        slide,
        slide_data,
        layout,
        title_font_size,
        content_font_size,
        presentation_title=None,
    ):
        return process_dynamic_layout_content(
            self,
            slide,
            slide_data,
            layout,
            title_font_size,
            content_font_size,
            presentation_title,
        )

    def _process_business_placeholders(
        self,
        slide,
        slide_data,
        presentation_title,
        prs=None,
        is_title_slide=False,
    ):
        return process_business_placeholders(
            self,
            slide,
            slide_data,
            presentation_title,
            prs,
            is_title_slide,
        )

    def create_presentation(self, ppt_schema, output_path):
        return create_presentation(self, ppt_schema, output_path)
