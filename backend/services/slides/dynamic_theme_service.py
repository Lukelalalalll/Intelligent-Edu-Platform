"""Dynamic theme service — loads base CSS templates and customises them via LLM."""

from __future__ import annotations

import logging
import os
import re

logger = logging.getLogger(__name__)

# ── Theme catalog ──
_THEME_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "static", "slides_themes")

AVAILABLE_THEMES = {
    "minimalist": {
        "name": "Minimalist Academic",
        "preview_colors": ["#ffffff", "#2d6a4f", "#1a1a2e"],
        "file": "minimalist.css",
        "description": "Clean serif style, white background, dark green accents — ideal for academic presentations.",
    },
    "neon_tech": {
        "name": "Neon Tech",
        "preview_colors": ["#0a0a1a", "#00ff88", "#ff00aa"],
        "file": "neon_tech.css",
        "description": "Dark cyberpunk aesthetic, monospace fonts, neon glow animations — perfect for tech talks.",
    },
    "corporate": {
        "name": "Corporate Blue",
        "preview_colors": ["#f5f7fa", "#1565c0", "#0d47a1"],
        "file": "corporate.css",
        "description": "Professional sans-serif, light grey background, blue gradient accents — great for business reports.",
    },
}

# ── LLM Prompt for CSS customisation ──

_THEME_CUSTOMISE_SYSTEM = """You are a senior front-end UI/UX designer specialising in presentation design.
Below is a complete CSS template for HTML slide decks that uses CSS custom properties (variables).

The user wants to customise the visual style. Their request is:

"{user_prompt}"

**Your task**: Modify ONLY the CSS variables block (the part inside `:root {{ ... }}`).
Keep all other CSS rules (class selectors, element styles, animations) exactly as they are.

**You MUST preserve every existing --slide-* variable name** — do not delete or rename any variable.
Only change the VALUES (colours, fonts, sizes, shadows, etc.) to match the user's aesthetic request.

**Constraints**:
- Output complete, valid CSS code (everything from the original file)
- Do NOT add any explanation, markdown code fences, or commentary
- Do NOT wrap the output in ```css or any other tags
- The output must start with `:root` or a `@import` statement
- Keep all CSS syntax valid — every `{` must have a matching `}`
- If the user asks for a colour scheme, adjust --slide-bg, --slide-text, --slide-heading, --slide-accent, --slide-accent-2
- If the user mentions fonts, adjust --slide-heading-font and --slide-body-font
- If the user mentions glow/neon/dark, adjust --slide-glow-effect, --slide-border-style
- If the user mentions animations, adjust --slide-transition

Original CSS template to customise:
{base_css}"""


class DynamicThemeService:
    """Service that loads base CSS templates and customises them via LLM.

    Usage::

        svc = DynamicThemeService()
        base = svc.load_base_css("neon_tech")
        custom = await svc.customize_theme(base, "dark ocean style with waves")
    """

    # ── Instance helpers (delegate to module-level functions) ──

    def load_base_css(self, theme_name: str) -> str:
        """Load the raw CSS content for a named theme.

        Args:
            theme_name: One of 'minimalist', 'neon_tech', 'corporate'.

        Returns:
            Complete CSS file contents as a string.
        """
        return load_base_css(theme_name)

    async def customize_theme(
        self,
        base_css_content: str,
        user_custom_theme_prompt: str,
        provider: str = "local_ollama",
    ) -> str:
        """Send the base CSS + user prompt to an LLM and return the customised CSS."""
        return await customize_theme(base_css_content, user_custom_theme_prompt, provider)


# ── Module-level functions (kept for backward compatibility) ──

def load_base_css(theme_name: str) -> str:
    """Load the raw CSS content for a named theme.

    Args:
        theme_name: One of 'minimalist', 'neon_tech', 'corporate'.

    Returns:
        Complete CSS file contents as a string.

    Raises:
        FileNotFoundError: if the theme CSS file doesn't exist.
        ValueError: if *theme_name* is not a recognised theme.
    """
    if theme_name not in AVAILABLE_THEMES:
        raise ValueError(
            f"Unknown theme '{theme_name}'. Available: {', '.join(AVAILABLE_THEMES)}"
        )

    file_path = os.path.join(_THEME_DIR, AVAILABLE_THEMES[theme_name]["file"])
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Theme CSS file not found: {file_path}")

    with open(file_path, "r", encoding="utf-8") as f:
        return f.read()


def _extract_css_from_llm_response(raw: str) -> str:
    """Post-process the LLM response to extract valid CSS.

    Handles cases where the model wraps output in markdown fences or
    includes explanatory text before/after the CSS.
    """
    text = raw.strip()

    # Strip markdown code fences if present
    fence_pattern = r"^```(?:css)?\s*\n(.*?)\n```\s*$"
    m = re.match(fence_pattern, text, re.DOTALL)
    if m:
        text = m.group(1).strip()

    # If there's a :root block, extract from first :root to last }
    root_idx = text.find(":root")
    if root_idx == -1:
        # Try to find any CSS-looking content
        # Look for @import or a CSS selector
        import_idx = text.find("@import")
        if import_idx != -1:
            text = text[import_idx:]
        else:
            logger.warning("LLM response contains no :root block — using as-is")
    else:
        text = text[root_idx:]

    # Find the last closing brace that terminates the :root block
    # Simple approach: count braces from :root onwards
    brace_count = 0
    in_root = False
    root_end = len(text)
    for i, ch in enumerate(text):
        if ch == "{" and not in_root:
            in_root = True
        if in_root:
            if ch == "{":
                brace_count += 1
            elif ch == "}":
                brace_count -= 1
            if brace_count == 0 and in_root:
                root_end = i + 1
                # Continue scanning to include rest of the CSS after :root
                # Reset brace_count for the remaining CSS
                in_root = False

    # Now we keep everything from start to the end of the file
    # but trim trailing junk that isn't CSS
    # Simple heuristic: keep everything up to the last } that's followed only by whitespace
    last_brace = text.rfind("}")
    if last_brace != -1:
        after_brace = text[last_brace + 1 :].strip()
        if after_brace and not after_brace.startswith(("/*", "*", "//")):
            # There's non-CSS content after the last brace — try to trim
            logger.info("Trimming trailing non-CSS content from LLM response")
            text = text[: last_brace + 1]

    return text.strip()


def _validate_css_variables(css: str, required_vars: list[str] | None = None) -> list[str]:
    """Check that critical CSS variables are present in the output.

    Returns a list of missing variable names (empty = all good).
    """
    if required_vars is None:
        required_vars = [
            "--slide-bg",
            "--slide-text",
            "--slide-heading",
            "--slide-accent",
            "--slide-accent-2",
            "--slide-heading-font",
            "--slide-body-font",
        ]

    missing = [v for v in required_vars if v not in css]
    if missing:
        logger.warning("CSS output is missing variables: %s", missing)
    return missing


async def customize_theme(
    base_css_content: str,
    user_custom_theme_prompt: str,
    provider: str = "local_ollama",
) -> str:
    """Send the base CSS + user prompt to an LLM and return the customised CSS.

    If the LLM service is not available, the base CSS is returned unchanged
    (graceful degradation).

    Args:
        base_css_content: Complete CSS source of the base theme.
        user_custom_theme_prompt: Natural-language description of desired style.
        provider: AI provider ('local_ollama' or 'coze').

    Returns:
        LLM-modified CSS string.  On error, returns the original *base_css_content*.
    """
    if not user_custom_theme_prompt.strip():
        logger.info("No custom style prompt provided — returning base theme unchanged.")
        return base_css_content

    system = _THEME_CUSTOMISE_SYSTEM.format(
        user_prompt=user_custom_theme_prompt,
        base_css=base_css_content,
    )

    # Truncate prompt if extremely long (most local models have context limits)
    max_prompt_chars = 12_000
    if len(system) > max_prompt_chars:
        logger.warning(
            "Theme prompt too long (%d chars), truncating to %d",
            len(system),
            max_prompt_chars,
        )
        system = system[:max_prompt_chars]

    try:
        from backend.services.ai_gateway_service.provider_factory import get_ai_gateway_service

        ai_service = get_ai_gateway_service()
        context = {"system_override": system}
        response = await ai_service.chat_with_provider(
            message="Generate the complete customised CSS now.",
            context=context,
            provider=provider,
        )
    except Exception as exc:
        logger.error("LLM theme customisation failed: %s", exc)
        logger.info("Falling back to base theme CSS.")
        return base_css_content

    if not response or not response.strip():
        logger.warning("LLM returned empty response — using base theme.")
        return base_css_content

    custom_css = _extract_css_from_llm_response(response)
    _validate_css_variables(custom_css)

    # If extraction produced very little output, fall back
    if len(custom_css) < 100:
        logger.warning("Extracted CSS is too short (%d chars) — falling back to base.", len(custom_css))
        return base_css_content

    return custom_css
