from __future__ import annotations

import html
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.config import Config

SLIDE_W = 1280
SLIDE_H = 720
_BANNED_PATTERNS = [
    (r"<style\b", "Embedded <style> is not allowed"),
    (r"\bclass=", "CSS class attributes are not allowed"),
    (r"<foreignObject\b", "<foreignObject> is not allowed"),
    (r"rgba\(", "rgba() is not allowed; use HEX plus opacity"),
    (r"<mask\b", "<mask> is not allowed"),
    (r"<script\b", "<script> is not allowed"),
    (r"<animate", "SVG animation elements are not allowed"),
]


def _safe_slug(text: str, fallback: str) -> str:
    slug = re.sub(r"[^\w\u4e00-\u9fff-]+", "_", str(text or "").strip(), flags=re.UNICODE)
    return slug[:60].strip("_") or fallback


def _wrap_text(text: str, *, limit: int = 34) -> list[str]:
    normalized = re.sub(r"\s+", " ", str(text or "").strip())
    if not normalized:
        return []
    # CJK-friendly rough wrap: count each CJK char as a word-ish unit by slicing.
    lines: list[str] = []
    current = ""
    for token in normalized.split(" "):
        if len(current) + len(token) + 1 > limit:
            if current:
                lines.append(current)
            current = token
        else:
            current = f"{current} {token}".strip()
    if current:
        lines.append(current)
    return lines[:3]


def _slide_rhythm(index: int, total: int) -> str:
    if index == 1 or index == total:
        return "anchor"
    return "breathing" if index % 4 == 0 else "dense"


def _build_spec_lock(*, runtime, title: str, slides: list[dict[str, Any]]) -> dict[str, Any]:
    rhythms = {f"P{idx + 1:02d}": _slide_rhythm(idx + 1, len(slides)) for idx in range(len(slides))}
    return {
        "canvas": {"viewBox": f"0 0 {SLIDE_W} {SLIDE_H}", "format": "PPT 16:9"},
        "llm": {
            "llm_provider": getattr(runtime, "provider_id", ""),
            "llm_model": getattr(runtime, "model", ""),
            "provider_source": getattr(runtime, "config_source", ""),
        },
        "mode": {"mode": "instructional"},
        "visual_style": {"visual_style": "swiss-minimal"},
        "colors": {
            "bg": "#F8FAFC",
            "surface": "#FFFFFF",
            "primary": "#1D4ED8",
            "accent": "#F59E0B",
            "text": "#111827",
            "text_secondary": "#475569",
            "border": "#CBD5E1",
        },
        "typography": {
            "font_family": "Microsoft YaHei, Arial, sans-serif",
            "title_family": "Arial, Microsoft YaHei, sans-serif",
            "body": 24,
            "title": 42,
            "subtitle": 24,
            "annotation": 15,
        },
        "icons": {"library": "tabler-outline", "stroke_width": 2, "inventory": []},
        "page_rhythm": rhythms,
        "forbidden": [message for _, message in _BANNED_PATTERNS],
        "title": title,
    }


def _build_design_spec(title: str, slides: list[dict[str, Any]], spec_lock: dict[str, Any]) -> str:
    lines = [
        f"# {title}",
        "",
        "## I Project Info",
        f"- Generated at: {datetime.now(timezone.utc).isoformat()}",
        f"- LLM provider: {spec_lock['llm']['llm_provider']}",
        f"- LLM model: {spec_lock['llm']['llm_model']}",
        "",
        "## II Canvas",
        f"- {spec_lock['canvas']['format']} / {spec_lock['canvas']['viewBox']}",
        "",
        "## III Visual Theme",
        "- Swiss-minimal instructional deck with restrained surfaces and strong readable hierarchy.",
        "",
        "## IV Typography",
        f"- Default: {spec_lock['typography']['font_family']}",
        "",
        "## IX Content Outline",
    ]
    for idx, slide in enumerate(slides, start=1):
        rhythm = spec_lock["page_rhythm"].get(f"P{idx:02d}", "dense")
        lines.append(f"- P{idx:02d} [{rhythm}] {slide.get('title') or f'Slide {idx}'}")
    return "\n".join(lines) + "\n"


def _svg_for_slide(slide: dict[str, Any], *, index: int, total: int, spec_lock: dict[str, Any]) -> str:
    colors = spec_lock["colors"]
    typography = spec_lock["typography"]
    title = html.escape(str(slide.get("title") or f"Slide {index}"))
    bullets = [str(item) for item in slide.get("content", []) if str(item).strip()][:5]
    rhythm = spec_lock["page_rhythm"].get(f"P{index:02d}", "dense")
    y = 205
    bullet_fragments: list[str] = []
    for bullet in bullets:
        wrapped = _wrap_text(bullet)
        bullet_fragments.append(
            f'<circle cx="108" cy="{y - 8}" r="5" fill="{colors["accent"]}"/>'
        )
        for line_no, line in enumerate(wrapped or [bullet]):
            dy = y + line_no * 31
            bullet_fragments.append(
                f'<text x="132" y="{dy}" font-size="{typography["body"]}" '
                f'font-family="{typography["font_family"]}" fill="{colors["text"]}">{html.escape(line)}</text>'
            )
        y += max(1, len(wrapped)) * 31 + 20

    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{SLIDE_W}" height="{SLIDE_H}" viewBox="0 0 {SLIDE_W} {SLIDE_H}">
  <rect x="0" y="0" width="{SLIDE_W}" height="{SLIDE_H}" fill="{colors["bg"]}"/>
  <rect x="56" y="54" width="1168" height="612" rx="22" fill="{colors["surface"]}" stroke="{colors["border"]}" stroke-width="2"/>
  <rect x="56" y="54" width="12" height="612" rx="6" fill="{colors["primary"]}"/>
  <text x="92" y="118" font-size="18" font-family="{typography["font_family"]}" fill="{colors["text_secondary"]}">P{index:02d} / {total:02d} · {rhythm}</text>
  <text x="92" y="176" font-size="{typography["title"]}" font-weight="700" font-family="{typography["title_family"]}" fill="{colors["text"]}">{title}</text>
  <line x1="92" y1="198" x2="1188" y2="198" stroke="{colors["border"]}" stroke-width="2"/>
  {''.join(bullet_fragments)}
  <text x="92" y="626" font-size="{typography["annotation"]}" font-family="{typography["font_family"]}" fill="{colors["text_secondary"]}">Generated with {html.escape(spec_lock["llm"]["llm_provider"])} · SVG-first draft</text>
</svg>
'''


def _quality_check(svg_text: str, spec_lock: dict[str, Any]) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    if f'viewBox="0 0 {SLIDE_W} {SLIDE_H}"' not in svg_text:
        issues.append({"severity": "error", "message": "viewBox does not match spec_lock canvas"})
    for pattern, message in _BANNED_PATTERNS:
        if re.search(pattern, svg_text, flags=re.IGNORECASE):
            issues.append({"severity": "error", "message": message})
    allowed_colors = set(spec_lock["colors"].values())
    for color in re.findall(r"#[0-9A-Fa-f]{6}", svg_text):
        if color.upper() not in {c.upper() for c in allowed_colors}:
            issues.append({"severity": "warning", "message": f"Color {color} is outside spec_lock"})
    return issues


def build_svg_deck(*, task_id: str, title: str, slides: list[dict[str, Any]], runtime) -> dict[str, Any]:
    deck_id = task_id
    project_dir = Path(Config.PPT_RESULTS_FOLDER) / "svg_decks" / deck_id
    svg_dir = project_dir / "svg_output"
    export_dir = project_dir / "exports"
    svg_dir.mkdir(parents=True, exist_ok=True)
    export_dir.mkdir(parents=True, exist_ok=True)

    spec_lock = _build_spec_lock(runtime=runtime, title=title, slides=slides)
    design_spec = _build_design_spec(title, slides, spec_lock)
    (project_dir / "spec_lock.json").write_text(json.dumps(spec_lock, ensure_ascii=False, indent=2), encoding="utf-8")
    (project_dir / "design_spec.md").write_text(design_spec, encoding="utf-8")

    slide_payloads: list[dict[str, Any]] = []
    quality_issues: list[dict[str, Any]] = []
    for idx, slide in enumerate(slides, start=1):
        basename = f"{idx:02d}_{_safe_slug(slide.get('title'), f'slide_{idx}')}.svg"
        svg_text = _svg_for_slide(slide, index=idx, total=len(slides), spec_lock=spec_lock)
        page_issues = _quality_check(svg_text, spec_lock)
        (svg_dir / basename).write_text(svg_text, encoding="utf-8")
        for issue in page_issues:
            quality_issues.append({"slide_index": idx, **issue})
        slide_payloads.append(
            {
                "index": idx,
                "title": slide.get("title") or f"Slide {idx}",
                "rhythm": spec_lock["page_rhythm"].get(f"P{idx:02d}", "dense"),
                "svg_url": f"/api/slides/decks/{deck_id}/slides/{idx}.svg",
                "preview_url": f"/api/slides/decks/{deck_id}/slides/{idx}.svg",
                "quality_status": "error" if any(i["severity"] == "error" for i in page_issues) else "ok",
                "filename": basename,
            }
        )

    quality_report = {
        "status": "failed" if any(i["severity"] == "error" for i in quality_issues) else "passed",
        "issues": quality_issues,
        "total_slides": len(slides),
    }
    (project_dir / "quality_report.json").write_text(
        json.dumps(quality_report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    manifest = {
        "deck_id": deck_id,
        "title": title,
        "project_dir": str(project_dir),
        "slides": slide_payloads,
        "quality_report": quality_report,
        "design_spec_url": f"/api/slides/decks/{deck_id}/design-spec",
        "spec_lock": spec_lock,
        "exports": {},
    }
    (project_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest
