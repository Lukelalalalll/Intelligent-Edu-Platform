from .pptx_font_utils_support.font_matching import (
    _font_style_variant,
    get_index_of_matching_font_detail_or_none,
    normalize_font_family_name,
    normalize_font_variants,
)
from .pptx_font_utils_support.font_metadata import (
    FontDetail,
    convert_eot_to_ttf,
    extract_font_from_eot,
    extract_font_name_from_file,
    get_font_details,
)
from .pptx_font_utils_support.google_fonts import (
    build_google_fonts_stylesheet_url,
    check_google_font_availability,
    get_google_font_file_urls,
)
from .pptx_font_utils_support.pptx_font_replace import (
    _replace_fonts_in_pptx_xml,
    _replace_fonts_in_xml_root,
    create_font_alias_config,
    replace_fonts_in_pptx,
)
from .pptx_font_utils_support.pptx_font_scan import (
    extract_fonts_from_oxml,
    extract_raw_fonts_and_embedded_details,
    extract_used_font_variants_from_pptx,
    extract_used_fonts_from_pptx,
    get_available_and_unavailable_fonts_for_pptx,
)

__all__ = [
    "FontDetail",
    "_font_style_variant",
    "build_google_fonts_stylesheet_url",
    "check_google_font_availability",
    "convert_eot_to_ttf",
    "create_font_alias_config",
    "extract_font_from_eot",
    "extract_font_name_from_file",
    "extract_fonts_from_oxml",
    "extract_raw_fonts_and_embedded_details",
    "extract_used_font_variants_from_pptx",
    "extract_used_fonts_from_pptx",
    "get_available_and_unavailable_fonts_for_pptx",
    "get_font_details",
    "get_google_font_file_urls",
    "get_index_of_matching_font_detail_or_none",
    "normalize_font_family_name",
    "normalize_font_variants",
    "replace_fonts_in_pptx",
    "_replace_fonts_in_xml_root",
    "_replace_fonts_in_pptx_xml",
]
