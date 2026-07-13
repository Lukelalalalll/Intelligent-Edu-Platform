from __future__ import annotations

import os
import re
import tempfile
from pathlib import Path
from typing import Optional

from fontTools.ttLib import TTFont
from pydantic import BaseModel

from .common import SFNT_FORMATS


class FontDetail(BaseModel):
    file: str
    size_bytes: int
    error: Optional[str] = None
    eot_extraction_error: Optional[str] = None
    family_name: Optional[str] = None
    subfamily_name: Optional[str] = None
    unique_id: Optional[str] = None
    full_name: Optional[str] = None
    version: Optional[str] = None
    postscript_name: Optional[str] = None
    trademark: Optional[str] = None
    manufacturer: Optional[str] = None
    designer: Optional[str] = None
    description: Optional[str] = None
    vendor_url: Optional[str] = None
    designer_url: Optional[str] = None
    license: Optional[str] = None
    license_url: Optional[str] = None
    weight_class: Optional[int] = None
    width_class: Optional[int] = None
    cap_height: Optional[int] = None
    x_height: Optional[int] = None
    ascent: Optional[int] = None
    descent: Optional[int] = None
    units_per_em: Optional[int] = None
    created: Optional[int] = None
    modified: Optional[int] = None
    ascender: Optional[int] = None
    descender: Optional[int] = None
    line_gap: Optional[int] = None
    num_glyphs: Optional[int] = None
    format: Optional[str] = None


def _clean_font_metadata_string(value: str) -> str:
    return "".join(char for char in value if char in "\t\n\r" or ord(char) >= 32).strip()


def _normalize_font_format(value: object) -> Optional[str]:
    if not value:
        return None
    raw = value.decode("latin1", errors="ignore") if isinstance(value, bytes) else str(value)
    return SFNT_FORMATS.get(raw, _clean_font_metadata_string(raw) or None)


def extract_font_from_eot(eot_path: Path) -> bytes:
    data = eot_path.read_bytes()
    for signature in (b"OTTO", b"ttcf", b"\x00\x01\x00\x00"):
        position = data.find(signature)
        if position != -1:
            return data[position:]
    raise ValueError("Could not find embedded font signature (OTTO/ttcf/TTF) in EOT file")


def get_font_details(path: str) -> FontDetail:
    font_path = Path(path)
    details = {"file": path, "size_bytes": font_path.stat().st_size, "error": None}
    try:
        is_eot = font_path.suffix.lower() in {".fntdata", ".eot"}
        if is_eot:
            try:
                embedded_font_data = extract_font_from_eot(font_path)
                with tempfile.NamedTemporaryFile(delete=False, suffix=".ttf") as tmp_file:
                    tmp_file.write(embedded_font_data)
                    tmp_path = tmp_file.name
                try:
                    font = TTFont(tmp_path)
                finally:
                    try:
                        os.unlink(tmp_path)
                    except Exception:
                        pass
            except Exception as exc:
                details["eot_extraction_error"] = str(exc)
                font = TTFont(str(font_path))
        else:
            font = TTFont(str(font_path))

        name_table = font.get("name")
        if name_table:
            names = {}
            for record in name_table.names:
                if record.platformID not in (1, 3) and record.nameID in names:
                    continue
                try:
                    name_str = record.toUnicode() if hasattr(record, "toUnicode") else str(record)
                except Exception:
                    continue
                cleaned_name = _clean_font_metadata_string(name_str or "")
                if cleaned_name:
                    names[record.nameID] = cleaned_name
            for name_id, key in {
                1: "family_name", 2: "subfamily_name", 3: "unique_id", 4: "full_name",
                5: "version", 6: "postscript_name", 7: "trademark", 8: "manufacturer",
                9: "designer", 10: "description", 11: "vendor_url", 12: "designer_url",
                13: "license", 14: "license_url",
            }.items():
                if name_id in names:
                    details[key] = names[name_id]

        os2_table = font.get("OS/2")
        if os2_table:
            details["weight_class"] = os2_table.usWeightClass
            details["width_class"] = os2_table.usWidthClass
            details["cap_height"] = getattr(os2_table, "sCapHeight", None)
            details["x_height"] = getattr(os2_table, "sxHeight", None)
            details["ascent"] = getattr(os2_table, "usWinAscent", None)
            details["descent"] = getattr(os2_table, "usWinDescent", None)
        head_table = font.get("head")
        if head_table:
            details["units_per_em"] = head_table.unitsPerEm
            details["created"] = head_table.created
            details["modified"] = head_table.modified
        hhea_table = font.get("hhea")
        if hhea_table:
            details["ascender"] = hhea_table.ascent
            details["descender"] = hhea_table.descent
            details["line_gap"] = hhea_table.lineGap
        if "cmap" in font:
            details["num_glyphs"] = len(font.getGlyphSet())
        if hasattr(font, "sfntVersion"):
            details["format"] = _normalize_font_format(font.sfntVersion)
        font.close()
    except Exception as exc:
        details["error"] = str(exc)
    return FontDetail(**details)


def convert_eot_to_ttf(inp_path: str, out_dir: str) -> str:
    eot_path = Path(inp_path)
    out_dir_path = Path(out_dir)
    if not eot_path.exists():
        raise FileNotFoundError(f"EOT file not found: {eot_path}")
    out_dir_path.mkdir(parents=True, exist_ok=True)
    embedded_font_data = extract_font_from_eot(eot_path)
    default_ext = ".otf" if embedded_font_data.startswith(b"OTTO") else ".ttc" if embedded_font_data.startswith(b"ttcf") else ".ttf"
    output_path = out_dir_path / f"{eot_path.stem}{default_ext}"
    with open(output_path, "wb") as file:
        file.write(embedded_font_data)
    return str(output_path)


def extract_font_name_from_file(file_path: str) -> str:
    filename = os.path.basename(file_path)
    try:
        font = TTFont(file_path)
        if "name" in font:
            name_table = font["name"]
            for name_id in [1, 4, 6]:
                for record in name_table.names:
                    if record.nameID == name_id and record.langID in {0, 0x409}:
                        font_name = record.toUnicode().strip()
                        if font_name:
                            font.close()
                            return font_name
            for record in name_table.names:
                if record.nameID == 1:
                    font_name = record.toUnicode().strip()
                    if font_name:
                        font.close()
                        return font_name
        font.close()
    except Exception as exc:
        print(f"[FONT DEBUG] Error reading font metadata for {filename}: {exc}")
    base_name = os.path.splitext(filename)[0]
    return "_".join(filename.split("_")[:-1]) if "_" in filename and len(filename.split("_")[-1].split(".")[0]) == 8 else base_name
