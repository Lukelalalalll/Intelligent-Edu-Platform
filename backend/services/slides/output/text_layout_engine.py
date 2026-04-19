"""Text Layout Engine for PPT slides.

Provides capacity estimation and controlled font-size stepping to replace the
uncontrolled MSO_AUTO_SIZE.TEXT_TO_FIT_SHAPE strategy described in the
PPT_TEMPLATE_BACKEND_OPT_PLAN_2026-04-13 optimisation plan (P0 items).

Responsibilities
----------------
1. Estimate how many wrapped lines a list of bullets will occupy.
2. Determine the largest font size (from a pre-defined step ladder) that fits
   all bullets inside a given placeholder shape.
3. Clean / trim bullet lists to enforce per-slide and per-bullet limits.
4. Emit structured audit log lines so every slide's layout decision is traceable.
"""

from __future__ import annotations

import re
from typing import Sequence

# ── CJK detection ────────────────────────────────────────────────────────────
_CJK_RE = re.compile(r'[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]')

# Char-width factors relative to the font size (in pt).
# English chars are narrower (≈ 0.58×), CJK chars are full-width (≈ 0.95×).
_CHAR_WIDTH_FACTOR = {'en': 0.58, 'zh': 0.95}

# Line-height factor relative to font size (accounts for descenders + leading).
_LINE_HEIGHT_FACTOR = 1.38

# Vertical padding assumed inside a text placeholder (top + bottom, in pt).
_V_PADDING_PT = 10.0

# Bullet inter-spacing — in units of "extra lines" between bullets.
_INTER_BULLET_LINES = 0.4

# Per-slide bullet limits.
MAX_BULLETS_PER_SLIDE: int = 5

# Per-bullet char limits by language.
MAX_CHARS_ZH: int = 80
MAX_CHARS_EN: int = 120

# Font-size step ladder (descending, finest-grained control).
FONT_SIZE_STEPS: tuple[float, ...] = (20.0, 18.0, 16.0, 14.0, 13.0, 12.0, 11.0)


# ── Language detection ────────────────────────────────────────────────────────

def detect_lang(text: str) -> str:
    """Return ``'zh'`` when CJK characters dominate, else ``'en'``."""
    if not text:
        return 'en'
    cjk_count = len(_CJK_RE.findall(text))
    return 'zh' if cjk_count / max(len(text), 1) > 0.25 else 'en'


# ── Line estimation ───────────────────────────────────────────────────────────

def estimate_line_count(text: str, shape_width_pt: float, font_size_pt: float,
                        lang: str = 'auto') -> int:
    """Estimate the number of wrapped lines that *text* will occupy.

    Args:
        text:           The text string (single bullet).
        shape_width_pt: Width of the text box in points.
        font_size_pt:   Font size in points.
        lang:           Language tag (``'en'``, ``'zh'``, or ``'auto'``).

    Returns:
        Estimated line count (minimum 1).
    """
    if not text:
        return 0
    if lang == 'auto':
        lang = detect_lang(text)

    char_width_pt = font_size_pt * _CHAR_WIDTH_FACTOR.get(lang, 0.58)
    # Safeguard against division by zero / unrealistically narrow boxes.
    chars_per_line = max(1, int(shape_width_pt / char_width_pt))
    # Ceiling division without math.ceil import.
    lines = -(-len(text) // chars_per_line)
    return max(1, lines)


def estimate_total_lines(bullets: Sequence[str], shape_width_pt: float,
                          font_size_pt: float) -> float:
    """Estimate the total rendered height of *bullets* expressed in lines.

    Includes fractional inter-bullet spacing.

    Args:
        bullets:        List of bullet text strings.
        shape_width_pt: Width of the text box in points.
        font_size_pt:   Font size in points.

    Returns:
        Total line-equivalent height (float).
    """
    non_empty = [b for b in bullets if b and b.strip()]
    if not non_empty:
        return 0.0

    total: float = 0.0
    for i, b in enumerate(non_empty):
        total += estimate_line_count(b, shape_width_pt, font_size_pt)
        if i < len(non_empty) - 1:
            total += _INTER_BULLET_LINES
    return total


# ── Font-size fitting ─────────────────────────────────────────────────────────

def fit_font_size(
    bullets: Sequence[str],
    shape_width_pt: float,
    shape_height_pt: float,
    preferred_pt: float = 16.0,
    steps: tuple[float, ...] = FONT_SIZE_STEPS,
    v_padding_pt: float = _V_PADDING_PT,
) -> float:
    """Return the largest font size from *steps* that makes *bullets* fit.

    The algorithm:
    1. Start from *preferred_pt* (honours the caller's intent — don't upscale).
    2. Walk down the step ladder.
    3. Return the first size where all bullets fit within the available height.
    4. If nothing fits, return the smallest step (content will still be visible).

    Args:
        bullets:         Bullet text strings for one slide.
        shape_width_pt:  Text-box width in points.
        shape_height_pt: Text-box height in points.
        preferred_pt:    The desired font size — acts as an upper ceiling.
        steps:           Descending sequence of candidate font sizes.
        v_padding_pt:    Top + bottom padding assumed inside the shape.

    Returns:
        Chosen font size in points (float).
    """
    if not bullets:
        return preferred_pt

    available_height_pt = max(shape_height_pt - v_padding_pt, font_size_pt_min(steps))

    # Only consider steps that are ≤ preferred_pt.
    candidates = [s for s in steps if s <= preferred_pt]
    if not candidates:
        candidates = [min(steps)]

    for pt in candidates:
        line_height_pt = pt * _LINE_HEIGHT_FACTOR
        total_lines = estimate_total_lines(bullets, shape_width_pt, pt)
        if total_lines * line_height_pt <= available_height_pt:
            return pt

    # Nothing fits — return the smallest candidate.
    return candidates[-1]


def font_size_pt_min(steps: tuple[float, ...]) -> float:
    """Return the minimum value in a steps tuple."""
    return min(steps) if steps else 10.0


# ── Bullet cleaning ───────────────────────────────────────────────────────────

_SPLIT_PUNCTUATION = re.compile(r'[。！？；,.!?;]+')


def clean_bullets(bullets: Sequence[str],
                  max_per_slide: int = MAX_BULLETS_PER_SLIDE,
                  max_chars_zh: int = MAX_CHARS_ZH,
                  max_chars_en: int = MAX_CHARS_EN) -> list[str]:
    """Sanitise a list of bullet strings before layout.

    Enforces:
    - Total bullet count ≤ *max_per_slide*.
    - Per-bullet character length ≤ *max_chars_zh* (Chinese) or *max_chars_en* (English).
    - Long bullets are split at sentence-ending punctuation and each part truncated.
    - Empty / whitespace-only bullets are discarded.

    Args:
        bullets:       Raw bullet list from upstream AI.
        max_per_slide: Maximum bullets allowed per slide.
        max_chars_zh:  Max chars for Chinese-dominant bullets.
        max_chars_en:  Max chars for English-dominant bullets.

    Returns:
        Cleaned list of at most *max_per_slide* non-empty bullet strings.
    """
    cleaned: list[str] = []

    for b in bullets:
        if not b or not b.strip():
            continue
        b = b.strip()
        lang = detect_lang(b)
        limit = max_chars_zh if lang == 'zh' else max_chars_en

        if len(b) <= limit:
            cleaned.append(b)
        else:
            # Try to split at punctuation boundaries first.
            parts = [p.strip() for p in _SPLIT_PUNCTUATION.split(b) if p.strip()]
            if parts:
                # Merge consecutive short parts and emit when approaching limit.
                buf = ''
                for part in parts:
                    if not buf:
                        buf = part
                    elif len(buf) + 1 + len(part) <= limit:
                        buf += '，' + part
                    else:
                        cleaned.append(buf[:limit])
                        buf = part
                if buf:
                    cleaned.append(buf[:limit])
            else:
                # No punctuation to split on — hard-truncate.
                cleaned.append(b[:limit])

    return cleaned[:max_per_slide]


# ── Shape helper (python-pptx independent) ────────────────────────────────────

def shape_dimensions_pt(shape) -> tuple[float, float]:
    """Return *(width_pt, height_pt)* of a python-pptx shape.

    python-pptx stores all lengths in EMUs (English Metric Units),
    where 1 pt = 12 700 EMU.
    """
    EMU_PER_PT = 12_700
    w = shape.width / EMU_PER_PT
    h = shape.height / EMU_PER_PT
    return w, h


# ── Audit logging ─────────────────────────────────────────────────────────────

def log_slide_layout_audit(
    slide_idx: int | str,
    title: str,
    layout_name: str,
    shape_w_pt: float,
    shape_h_pt: float,
    bullet_count: int,
    initial_pt: float,
    final_pt: float,
    needs_split: bool = False,
    layout_override: str | None = None,
) -> None:
    """Emit a structured audit log line for one slide's layout decision.

    Fields are pipe-delimited for easy grep / log aggregation.

    Example output::

        [SLIDE_AUDIT] #3 | layout=Title and Content | box=(720x400pt) |
        bullets=4 | font=16→14pt | SPLIT=no
    """
    msg = (
        f"[SLIDE_AUDIT] #{slide_idx} | title={title!r:.40} | "
        f"layout={layout_name} | box=({shape_w_pt:.0f}x{shape_h_pt:.0f}pt) | "
        f"bullets={bullet_count} | font={initial_pt:.0f}→{final_pt:.0f}pt | "
        f"SPLIT={'yes' if needs_split else 'no'}"
    )
    if layout_override:
        msg += f" | LAYOUT_OVERRIDE={layout_override}"
    print(msg)
