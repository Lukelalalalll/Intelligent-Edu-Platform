"""Pure SVG utility functions — no FastAPI or database dependencies.

All functions are stateless and independently unit-testable.

Public API
----------
get_sub4_paths() -> tuple[str, str]
extract_svg_from_ai_output(raw_content: str) -> str
estimate_svg_quality(svg_code: str) -> int
validate_svg_xml(svg_code: str) -> tuple[bool, str | None]
build_diagram_generation_prompt(description: str) -> str
build_diagram_refine_prompt(description: str, draft_svg: str) -> str
build_svg_syntax_repair_prompt(svg_code: str, parse_error: str) -> str
split_diagram_points(description: str, limit: int = 5) -> list[str]
build_fallback_svg(description: str) -> str
"""

import html
import logging
import os
import re
import xml.etree.ElementTree as ET

from backend.config import Config

logger = logging.getLogger(__name__)

# ── Path helpers ──────────────────────────────────────────────────────────────


def get_sub4_paths() -> tuple[str, str]:
    """Return (upload_folder, generated_folder) for the diagram feature, creating them if needed."""
    upload_folder = os.path.join(Config.UPLOAD_FOLDER, "sub4")
    generated_folder = os.path.join(Config.BASE_DIR, "generated", "sub4")
    os.makedirs(upload_folder, exist_ok=True)
    os.makedirs(generated_folder, exist_ok=True)
    return upload_folder, generated_folder


# ── SVG extraction & validation ───────────────────────────────────────────────


def extract_svg_from_ai_output(raw_content: str) -> str:
    """Extract and repair SVG from non-deterministic LLM output."""
    content = str(raw_content or "").strip()
    if not content:
        raise ValueError("AI returned empty content")

    # Some providers may return a JSON envelope instead of raw text.
    try:
        import json
        payload = json.loads(content)
        if isinstance(payload, dict):
            for key in ("svg", "content", "diagram", "result"):
                value = payload.get(key)
                if isinstance(value, str) and value.strip():
                    content = value.strip()
                    break
    except Exception:
        pass

    # Prefer fenced payload when markdown wrappers are present.
    fenced = re.search(r"```(?:svg|xml)?\s*([\s\S]*?)\s*```", content, re.IGNORECASE)
    if fenced:
        content = fenced.group(1).strip()

    # Many local models return HTML-escaped XML.
    if "<svg" not in content.lower() and "&lt;svg" in content.lower():
        content = html.unescape(content)

    svg_code = ""
    full_svg = re.search(r"<svg\b[\s\S]*?</svg>", content, re.IGNORECASE)
    if full_svg:
        svg_code = full_svg.group(0)
    else:
        self_closing_svg = re.search(r"<svg\b[^>]*?/>", content, re.IGNORECASE)
        if self_closing_svg:
            svg_code = self_closing_svg.group(0)
        else:
            start = re.search(r"<svg\b", content, re.IGNORECASE)
            if start:
                tail = content[start.start():].strip()
                svg_code = tail if "</svg>" in tail.lower() else f"{tail}</svg>"

    # Last resort: wrap common SVG inner elements.
    if not svg_code:
        has_svg_inner = any(
            tag in content.lower()
            for tag in ("<rect", "<circle", "<ellipse", "<path", "<line", "<polyline", "<polygon", "<text", "<g")
        )
        if has_svg_inner:
            svg_code = (
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 800">'
                f"{content}"
                "</svg>"
            )

    if not svg_code:
        preview = content[:200].replace("\n", " ")
        raise ValueError(f"Could not extract SVG element from AI response: {preview}")

    # Ensure xmlns exists for browser rendering consistency.
    first_tag = svg_code.split(">", 1)[0].lower()
    if "xmlns=" not in first_tag:
        svg_code = re.sub(
            r"<svg\b",
            '<svg xmlns="http://www.w3.org/2000/svg"',
            svg_code,
            count=1,
            flags=re.IGNORECASE,
        )

    # Fix unescaped '&' which breaks XML parsing.
    svg_code = re.sub(
        r"&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)",
        "&amp;",
        svg_code,
    )

    return svg_code


def estimate_svg_quality(svg_code: str) -> int:
    """Heuristic quality score to decide whether a refinement pass is needed."""
    svg = str(svg_code or "")
    lower = svg.lower()
    score = 0

    if "viewbox=" in lower:
        score += 2
    if "<defs" in lower:
        score += 1
    if "marker-end" in lower or "<marker" in lower:
        score += 1
    if "font-family" in lower:
        score += 1
    if "rx=" in lower or "ry=" in lower:
        score += 1
    if "<filter" in lower:
        score += 1

    shape_count = len(re.findall(r"<(rect|circle|ellipse|path|polygon|line|polyline)\b", lower))
    text_count = len(re.findall(r"<text\b", lower))

    if shape_count >= 6:
        score += 2
    elif shape_count >= 3:
        score += 1

    if text_count >= 4:
        score += 2
    elif text_count >= 2:
        score += 1

    return score


def validate_svg_xml(svg_code: str) -> tuple[bool, str | None]:
    """Validate whether SVG is well-formed XML."""
    try:
        ET.fromstring(svg_code)
        return True, None
    except ET.ParseError as exc:
        return False, str(exc)


# ── Prompt builders ───────────────────────────────────────────────────────────


def build_diagram_generation_prompt(description: str) -> str:
    return (
        "You are an expert SVG diagram designer for educational content. "
        "Generate ONE polished, production-ready SVG diagram.\n\n"
        "OUTPUT FORMAT RULES:\n"
        "1. Output ONLY raw SVG XML from <svg ...> to </svg>. No markdown.\n"
        "2. The SVG must be valid XML and directly renderable in browsers.\n"
        "3. Escape text entities properly (&amp;, &lt;, &gt;, &quot;).\n\n"
        "LAYOUT + VISUAL RULES:\n"
        "1. Use viewBox at least 1200x800.\n"
        "2. Keep generous spacing: horizontal gap >= 80px, vertical gap >= 64px.\n"
        "3. No overlap between labels, nodes, and arrows.\n"
        "4. Use rounded cards (rx/ry), consistent stroke width (2-3), and clean arrowheads.\n"
        "5. Typography: font-family='Inter, Arial, sans-serif', title 22-26px, body 14-16px.\n"
        "6. Color palette: one primary, one accent, one neutral background; avoid random colors.\n"
        "7. Include subtle shadow filter and clear visual hierarchy.\n"
        "8. Keep text concise and readable with padding inside containers.\n\n"
        "Description:\n"
        f"{description}"
    )


def build_diagram_refine_prompt(description: str, draft_svg: str) -> str:
    return (
        "You are a strict SVG quality reviewer. Improve the following draft SVG while preserving semantics.\n\n"
        "MANDATORY FIX CHECKLIST:\n"
        "1. Remove overlaps and improve alignment/spacing.\n"
        "2. Normalize typography and color consistency.\n"
        "3. Ensure arrows are clear and do not cross labels where possible.\n"
        "4. Keep/ensure valid XML and complete <svg>...</svg>.\n"
        "5. Keep content concise and professional for educational use.\n\n"
        "Return ONLY the final improved SVG XML.\n\n"
        "Original description:\n"
        f"{description}\n\n"
        "Draft SVG:\n"
        f"{draft_svg}"
    )


def build_svg_syntax_repair_prompt(svg_code: str, parse_error: str) -> str:
    return (
        "You are an XML/SVG repair assistant.\n"
        "The SVG below is malformed XML. Fix ONLY syntax/structure errors and return valid SVG.\n\n"
        "RULES:\n"
        "1. Output ONLY one valid <svg>...</svg> document.\n"
        "2. Preserve original visual layout and text content as much as possible.\n"
        "3. Close all opened tags correctly (e.g., <g>, <text>, <defs>).\n"
        "4. Do not add markdown fences or explanations.\n\n"
        f"Parse error: {parse_error}\n\n"
        "Malformed SVG:\n"
        f"{svg_code}"
    )


# ── Content utilities ─────────────────────────────────────────────────────────


def split_diagram_points(description: str, limit: int = 5) -> list[str]:
    text = re.sub(r"\s+", " ", str(description or "").strip())
    if not text:
        return ["Topic"]

    parts = [p.strip(" -") for p in re.split(r"[.;:!?]|\s->\s|\s=>\s", text) if p.strip()]
    if not parts:
        parts = [text]

    # If user prompt is a single short phrase, synthesize meaningful steps instead of echoing raw input.
    if len(parts) <= 1:
        lower = text.lower()
        if "software development" in lower or "sdlc" in lower:
            return [
                "Requirement Analysis",
                "System Design",
                "Implementation",
                "Testing",
                "Deployment",
            ][:limit]
        if "machine learning" in lower or "ml pipeline" in lower:
            return [
                "Data Collection",
                "Data Preprocessing",
                "Model Training",
                "Evaluation",
                "Deployment & Monitoring",
            ][:limit]
        return [
            "Overview",
            "Key Components",
            "Workflow Steps",
            "Validation",
            "Final Output",
        ][:limit]

    return parts[:limit]


def build_fallback_svg(description: str) -> str:
    """Build a guaranteed-valid SVG if model outputs remain malformed."""
    title = html.escape((description or "Diagram").strip()[:90])
    points = [html.escape(p[:80]) for p in split_diagram_points(description)]

    node_w = 880
    node_h = 88
    gap = 36
    start_x = 160
    start_y = 150
    canvas_h = max(800, start_y + len(points) * (node_h + gap) + 120)

    nodes = []
    arrows = []
    for i, label in enumerate(points):
        y = start_y + i * (node_h + gap)
        nodes.append(
            f'<rect x="{start_x}" y="{y}" width="{node_w}" height="{node_h}" '
            'rx="16" ry="16" fill="#ffffff" stroke="#1f2937" stroke-width="2" filter="url(#soft-shadow)"/>'
        )
        nodes.append(
            f'<text x="{start_x + 26}" y="{y + 52}" font-size="20" fill="#0f172a">{label}</text>'
        )

        if i < len(points) - 1:
            x = start_x + node_w // 2
            y1 = y + node_h
            y2 = y + node_h + gap - 8
            arrows.append(
                f'<line x1="{x}" y1="{y1}" x2="{x}" y2="{y2}" stroke="#1f2937" stroke-width="2" marker-end="url(#arrow-end)"/>'
            )

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 {canvas_h}">'
        "<defs>"
        '<marker id="arrow-end" markerWidth="12" markerHeight="8" refX="10" refY="4" orient="auto" markerUnits="strokeWidth">'
        '<path d="M0,0 L12,4 L0,8 z" fill="#1f2937" />'
        "</marker>"
        '<filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%">'
        '<feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.18" />'
        "</filter>"
        "</defs>"
        f'<rect x="0" y="0" width="1200" height="{canvas_h}" fill="#f8fafc"/>'
        f'<text x="70" y="82" font-size="34" font-family="Inter, Arial, sans-serif" fill="#0f172a">{title}</text>'
        + "".join(arrows)
        + "".join(nodes)
        + "</svg>"
    )
