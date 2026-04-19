import glob
import json
import logging
import os
import re

try:
    import opendataloader_pdf
except ModuleNotFoundError:  # optional dependency
    opendataloader_pdf = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers: extract headings from the JSON structure tree and inject them
# into the generated markdown when the converter fails to produce ``#`` lines.
# ---------------------------------------------------------------------------

def _find_headings(node, results=None):
    """Recursively collect ``heading`` elements from the JSON tree."""
    if results is None:
        results = []
    if node.get("type") == "heading":
        content = (node.get("content") or "").strip()
        if content:
            results.append(
                {
                    "level": node.get("heading level", 1),
                    "content": content,
                    "page": node.get("page number"),
                }
            )
    for kid in node.get("kids", []):
        _find_headings(kid, results)
    return results


def _filter_page_headers(headings):
    """Remove headings that are repeated page headers (same text on 2+ pages)."""
    text_pages: dict[str, set] = {}
    for h in headings:
        text_pages.setdefault(h["content"], set()).add(h["page"])
    return [h for h in headings if len(text_pages[h["content"]]) < 2]


def _normalize_levels(headings):
    """Compress arbitrary heading levels (e.g. 1,6,10) into 1-based ranks."""
    if not headings:
        return headings
    raw_levels = sorted({h["level"] for h in headings})
    rank = {lv: idx + 1 for idx, lv in enumerate(raw_levels)}
    for h in headings:
        h["level"] = min(rank[h["level"]], 6)
    return headings


def _inject_headings_into_md(md_text, headings):
    """Find each heading's content in *md_text* and prepend ``#`` markers."""
    lines = md_text.split("\n")
    injected = set()
    for h in headings:
        target = h["content"]
        prefix = "#" * h["level"] + " "
        for i, line in enumerate(lines):
            stripped = line.lstrip("- ").strip()
            if stripped == target and i not in injected:
                lines[i] = prefix + target
                injected.add(i)
                break
    return "\n".join(lines)


def _inject_numbered_sections(md_text):
    """Heuristic: turn top-level numbered list items (``- 1.``, ``- 2.``) into ``##`` headers."""
    lines = md_text.split("\n")
    first_nonempty = None
    for i, line in enumerate(lines):
        if line.strip():
            first_nonempty = i
            break

    # Promote the very first non-empty line as ``#`` title if it looks like one.
    if first_nonempty is not None:
        fl = lines[first_nonempty].strip()
        if fl and not fl.startswith("#") and len(fl) < 120 and not fl.endswith((".",";")):
            lines[first_nonempty] = "# " + fl

    pattern = re.compile(r"^(?:- )?(\d+)\.\s")
    for i, line in enumerate(lines):
        if i == first_nonempty:
            continue  # already handled as title
        m = pattern.match(line)
        if m:
            rest = line[m.end():].strip()
            num = m.group(1)
            lines[i] = f"## {num}. {rest}" if rest else f"## Question {num}"

    return "\n".join(lines)


def _enrich_md_with_json(md_path, json_path):
    """Post-process: inject headings from JSON when the markdown has none."""
    with open(md_path, "r", encoding="utf-8", errors="replace") as f:
        md_text = f.read()

    if not md_text.strip():
        return  # empty file (e.g. image-based PDF)

    has_headers = any(
        line.strip().startswith("#") for line in md_text.split("\n")
    )
    if has_headers:
        return  # converter already produced # headers

    # --- Try JSON-based heading injection ---
    if os.path.exists(json_path):
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        headings = _find_headings(data)
        headings = _filter_page_headers(headings)
        headings = _normalize_levels(headings)
        if headings:
            md_text = _inject_headings_into_md(md_text, headings)
            with open(md_path, "w", encoding="utf-8") as f:
                f.write(md_text)
            return

    # --- Fallback: heuristic numbered-section detection ---
    md_text = _inject_numbered_sections(md_text)
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_text)


def _fallback_pdf_to_md(file_path: str, output_path: str) -> None:
    """Fallback conversion when OpenDataLoader cannot run (e.g., Java missing)."""
    import fitz

    doc = fitz.open(file_path)
    sections: list[str] = [f"# {os.path.splitext(os.path.basename(file_path))[0]}"]
    for i, page in enumerate(doc, 1):
        page_text = page.get_text("text") or ""
        sections.append(f"## Page {i}\n\n{page_text.strip()}")
    doc.close()

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n\n".join(sections).strip() + "\n")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def convert_pdf_to_md(file_path, output_path):
    output_dir = os.path.dirname(output_path)
    os.makedirs(output_dir, exist_ok=True)

    # Generate both markdown and JSON so we can enrich headers if needed.
    # If Java is unavailable, degrade gracefully to a PyMuPDF-based converter.
    try:
        opendataloader_pdf.convert(
            input_path=file_path,
            output_dir=output_dir,
            format="json,markdown",
            quiet=True,
            image_output="off",
        )
    except FileNotFoundError as exc:
        logger.warning("OpenDataLoader unavailable (likely missing Java), using fallback parser: %s", exc)
        _fallback_pdf_to_md(file_path, output_path)
        return
    except Exception as exc:  # noqa: BLE001
        msg = str(exc).lower()
        if "java" in msg:
            logger.warning("OpenDataLoader Java runtime error, using fallback parser: %s", exc)
            _fallback_pdf_to_md(file_path, output_path)
            return
        raise

    stem = os.path.splitext(os.path.basename(file_path))[0]

    # Locate the markdown file produced by the converter.
    if not os.path.exists(output_path):
        candidates = sorted(
            glob.glob(os.path.join(output_dir, f"{stem}*.md")),
            key=os.path.getmtime,
            reverse=True,
        )
        if not candidates:
            raise RuntimeError(
                f"OpenDataLoader did not generate markdown for: {file_path}"
            )
        if candidates[0] != output_path:
            os.replace(candidates[0], output_path)

    # Locate the companion JSON file.
    json_candidates = sorted(
        glob.glob(os.path.join(output_dir, f"{stem}*.json")),
        key=os.path.getmtime,
        reverse=True,
    )
    json_path = json_candidates[0] if json_candidates else ""

    # Enrich: inject headings from JSON / heuristics when markdown lacks them.
    _enrich_md_with_json(output_path, json_path)
