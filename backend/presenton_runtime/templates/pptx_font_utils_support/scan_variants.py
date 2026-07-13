from __future__ import annotations

import os
import xml.etree.ElementTree as ET
import zipfile
from typing import Dict, List, Optional, Set, Tuple

from .common import PPT_NS, REL_NS
from .font_matching import _font_style_variant
from .scan_oxml import _extract_typefaces_from_text_style_node, extract_fonts_from_xml_root


def extract_used_font_variants_from_pptx(pptx_path: str) -> Dict[str, Set[str]]:
    def local_name(tag: str) -> str:
        return tag.rsplit("}", 1)[-1] if "}" in tag else tag

    def read_zip_xml(zip_ref: zipfile.ZipFile, path: str) -> Optional[ET.Element]:
        try:
            return ET.fromstring(zip_ref.read(path))
        except Exception:
            return None

    def get_relationships(zip_ref: zipfile.ZipFile, path: str) -> Dict[str, Dict[str, str]]:
        dir_name = os.path.dirname(path)
        rels_xml = read_zip_xml(zip_ref, os.path.join(dir_name, "_rels", f"{os.path.basename(path)}.rels").replace("\\", "/"))
        rels: Dict[str, Dict[str, str]] = {}
        if rels_xml is None:
            return rels
        for rel in rels_xml.findall(f"{{{REL_NS}}}Relationship"):
            rel_id, rel_type, target = rel.get("Id"), rel.get("Type"), rel.get("Target")
            if not rel_id or not rel_type or not target:
                continue
            resolved = target[1:] if target.startswith("/") else os.path.normpath(os.path.join(dir_name, target)).replace("\\", "/")
            rels[rel_id] = {"path": resolved, "type": rel_type}
        return rels

    def load_theme_fonts(zip_ref: zipfile.ZipFile) -> Dict[str, str]:
        presentation_xml = read_zip_xml(zip_ref, "ppt/presentation.xml")
        if presentation_xml is None:
            return {}
        pres_rels = get_relationships(zip_ref, "ppt/presentation.xml")
        theme_path = next((rel["path"] for rel in pres_rels.values() if "theme" in rel.get("type", "")), "ppt/theme/theme1.xml")
        theme_xml = read_zip_xml(zip_ref, theme_path)
        font_scheme = theme_xml.find(".//a:fontScheme", PPT_NS) if theme_xml is not None else None
        if font_scheme is None:
            return {}
        theme_fonts: Dict[str, str] = {}
        for key, xpath in (("major", "a:majorFont/a:latin"), ("minor", "a:minorFont/a:latin")):
            node = font_scheme.find(xpath, PPT_NS)
            if node is not None and node.get("typeface"):
                theme_fonts[key] = node.get("typeface", "").strip()
        return theme_fonts

    def get_slide_paths(zip_ref: zipfile.ZipFile) -> List[str]:
        presentation_xml = read_zip_xml(zip_ref, "ppt/presentation.xml")
        pres_rels = get_relationships(zip_ref, "ppt/presentation.xml")
        if presentation_xml is None:
            slide_paths = [name for name in zip_ref.namelist() if name.startswith("ppt/slides/slide") and name.endswith(".xml")]
            slide_paths.sort(key=lambda name: int(os.path.basename(name).replace("slide", "").replace(".xml", "")))
            return slide_paths
        slide_id_list = presentation_xml.find("p:sldIdLst", PPT_NS)
        if slide_id_list is None:
            return []
        rel_attr = f"{{{PPT_NS['r']}}}id"
        return [pres_rels[rel_id]["path"] for slide_id in slide_id_list.findall("p:sldId", PPT_NS) if (rel_id := slide_id.get(rel_attr)) in pres_rels and "slide" in pres_rels[rel_id].get("type", "")]

    def is_placeholder(shape: ET.Element) -> bool:
        nv_pr = shape.find("p:nvSpPr/p:nvPr", PPT_NS)
        return nv_pr is not None and nv_pr.find("p:ph", PPT_NS) is not None

    def is_hidden(shape: ET.Element) -> bool:
        for xpath in ("p:nvSpPr/p:cNvPr", "p:nvPicPr/p:cNvPr", "p:nvGraphicFramePr/p:cNvPr"):
            node = shape.find(xpath, PPT_NS)
            if node is not None:
                return node.get("hidden") in {"1", "true"}
        return False

    def placeholder_key(shape: ET.Element) -> Optional[Tuple[str, Optional[str]]]:
        ph = shape.find("p:nvSpPr/p:nvPr/p:ph", PPT_NS)
        return (ph.get("type") or "body", ph.get("idx")) if ph is not None else None

    def placeholder_style_key(ph_type: str) -> str:
        return "title" if ph_type in {"title", "ctrTitle"} else "body" if ph_type == "body" else "other"

    def build_placeholder_text_style_map(layout_xml: Optional[ET.Element], master_xml: Optional[ET.Element]):
        style_map: Dict[Tuple[str, Optional[str]], Dict[int, List[ET.Element]]] = {}
        tx_styles = master_xml.find("p:txStyles", PPT_NS) if master_xml is not None else None
        defaults: Dict[str, Dict[int, ET.Element]] = {}
        if tx_styles is not None:
            for name, key in (("p:titleStyle", "title"), ("p:bodyStyle", "body"), ("p:otherStyle", "other")):
                style_elem = tx_styles.find(name, PPT_NS)
                per_level = {level - 1: def_rpr for level in range(1, 10) if (lvl_pr := style_elem.find(f"a:lvl{level}pPr", PPT_NS)) is not None and (def_rpr := lvl_pr.find("a:defRPr", PPT_NS)) is not None} if style_elem is not None else {}
                if per_level:
                    defaults[key] = per_level
        for xml_root in (master_xml, layout_xml):
            sp_tree = xml_root.find(".//p:spTree", PPT_NS) if xml_root is not None else None
            if sp_tree is None:
                continue
            for child in sp_tree:
                if local_name(child.tag) != "sp":
                    continue
                key = placeholder_key(child)
                if not key:
                    continue
                base_defaults = defaults.get(placeholder_style_key(key[0]), {})
                tx_body = child.find("p:txBody", PPT_NS)
                lst_style = tx_body.find("a:lstStyle", PPT_NS) if tx_body is not None else None
                per_level: Dict[int, List[ET.Element]] = {}
                for level in range(1, 10):
                    variants = []
                    if lst_style is not None and (lvl_pr := lst_style.find(f"a:lvl{level}pPr", PPT_NS)) is not None and (def_rpr := lvl_pr.find("a:defRPr", PPT_NS)) is not None:
                        variants.append(def_rpr)
                    if level - 1 in base_defaults:
                        variants.append(base_defaults[level - 1])
                    if variants:
                        per_level[level - 1] = variants
                if per_level:
                    style_map[key] = per_level
        return style_map

    def paragraph_level(p_pr: Optional[ET.Element]) -> int:
        try:
            return int(p_pr.get("lvl")) if p_pr is not None and p_pr.get("lvl") is not None else 0
        except ValueError:
            return 0

    def build_local_text_style_map(tx_body: ET.Element) -> Dict[int, List[ET.Element]]:
        lst_style = tx_body.find("a:lstStyle", PPT_NS)
        return {level - 1: [def_rpr] for level in range(1, 10) if lst_style is not None and (lvl_pr := lst_style.find(f"a:lvl{level}pPr", PPT_NS)) is not None and (def_rpr := lvl_pr.find("a:defRPr", PPT_NS)) is not None}

    def get_default_rprs(p_pr, local_text_styles, placeholder_text_styles, key):
        defaults = list(local_text_styles.get(paragraph_level(p_pr), []))
        if not placeholder_text_styles or not key:
            return defaults
        style_map = placeholder_text_styles.get(key) or (placeholder_text_styles.get((key[0], None)) if key[0] else None)
        if style_map:
            defaults.extend(style_map.get(paragraph_level(p_pr), []))
        return defaults

    def merge_font_variants(target: Dict[str, Set[str]], source: Dict[str, Set[str]]) -> None:
        for font_name, variants in source.items():
            target.setdefault(font_name, set()).update(variants)

    def extract_effective_run_font_variants(r_pr, default_rprs, theme_fonts):
        variant_fonts: Dict[str, Set[str]] = {}
        for style_node in [r_pr, *default_rprs]:
            direct_fonts = _extract_typefaces_from_text_style_node(style_node, theme_fonts) if style_node is not None else []
            if not direct_fonts:
                continue
            for font_name in direct_fonts:
                variant_fonts.setdefault(font_name, set()).add(_font_style_variant(font_name, r_pr, default_rprs if style_node is r_pr else [style_node]))
            return variant_fonts
        return variant_fonts

    def collect_fonts_from_text_body(tx_body, placeholder_text_styles, key, theme_fonts):
        font_variants: Dict[str, Set[str]] = {}
        local_text_styles = build_local_text_style_map(tx_body)
        run_tags = {f"{{{PPT_NS['a']}}}r", f"{{{PPT_NS['a']}}}fld"}
        for paragraph in tx_body.findall("a:p", PPT_NS):
            default_rprs = get_default_rprs(paragraph.find("a:pPr", PPT_NS), local_text_styles, placeholder_text_styles, key)
            for child in paragraph:
                text_node = child.find("a:t", PPT_NS)
                if child.tag in run_tags and text_node is not None and text_node.text:
                    merge_font_variants(font_variants, extract_effective_run_font_variants(child.find("a:rPr", PPT_NS), default_rprs, theme_fonts))
        return font_variants

    def iter_shape_nodes(parent: ET.Element):
        for child in parent:
            name = local_name(child.tag)
            if name == "grpSp":
                yield from iter_shape_nodes(child)
            elif name in {"sp", "graphicFrame"}:
                yield child

    def collect_fonts_from_shape_tree(sp_tree, theme_fonts, skip_placeholders=False, placeholder_text_styles=None):
        font_variants: Dict[str, Set[str]] = {}
        for shape in iter_shape_nodes(sp_tree):
            if is_hidden(shape):
                continue
            if local_name(shape.tag) == "sp":
                if skip_placeholders and is_placeholder(shape):
                    continue
                tx_body = shape.find("p:txBody", PPT_NS)
                if tx_body is not None:
                    merge_font_variants(font_variants, collect_fonts_from_text_body(tx_body, placeholder_text_styles, placeholder_key(shape), theme_fonts))
            else:
                for tx_body in shape.findall(".//a:txBody", PPT_NS):
                    merge_font_variants(font_variants, collect_fonts_from_text_body(tx_body, None, None, theme_fonts))
        return font_variants

    raw_font_variants: Dict[str, Set[str]] = {}
    try:
        with zipfile.ZipFile(pptx_path, "r") as zip_ref:
            theme_fonts = load_theme_fonts(zip_ref)
            for slide_path in get_slide_paths(zip_ref):
                slide_xml = read_zip_xml(zip_ref, slide_path)
                if slide_xml is None:
                    continue
                slide_rels = get_relationships(zip_ref, slide_path)
                layout_path = next((rel["path"] for rel in slide_rels.values() if "slideLayout" in rel.get("type", "")), None)
                layout_xml = read_zip_xml(zip_ref, layout_path) if layout_path else None
                layout_rels = get_relationships(zip_ref, layout_path) if layout_path else {}
                master_path = next((rel["path"] for rel in layout_rels.values() if "slideMaster" in rel.get("type", "")), None)
                master_xml = read_zip_xml(zip_ref, master_path) if master_path else None
                placeholder_text_styles = build_placeholder_text_style_map(layout_xml, master_xml)
                for xml_root, skip_placeholders in ((master_xml, True), (layout_xml, True), (slide_xml, False)):
                    sp_tree = xml_root.find(".//p:spTree", PPT_NS) if xml_root is not None else None
                    if sp_tree is not None:
                        merge_font_variants(raw_font_variants, collect_fonts_from_shape_tree(sp_tree, theme_fonts, skip_placeholders, None if skip_placeholders else placeholder_text_styles))
            for name in zip_ref.namelist():
                if name.startswith("ppt/charts/") and name.endswith(".xml") and (chart_xml := read_zip_xml(zip_ref, name)) is not None:
                    for font_name in extract_fonts_from_xml_root(chart_xml, theme_fonts):
                        raw_font_variants.setdefault(font_name, set()).add("regular")
    except Exception:
        print("Failed to read PPTX XML parts, returning empty fonts list")
        return {}
    return raw_font_variants
