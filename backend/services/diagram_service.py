"""Diagram generation service — multi-pass SVG generation with fallback.

Orchestrates:
  1. Draft generation (primary provider)
  2. Refinement pass  (if quality < 9)
  3. XML repair pass  (if parse error)
  4. Alternate-provider retry (if repair still fails)
  5. Deterministic fallback SVG (last resort)

Public API
----------
generate_svg(text, provider, user_id, ai_service) -> dict
    Returns {"svg": str, "provider": str, "draft_quality": int,
             "refined": bool, "fallback_used": bool, "provider_switched": bool}
"""

import logging

from backend.utils.svg_utils import (
    build_diagram_generation_prompt,
    build_diagram_refine_prompt,
    build_fallback_svg,
    build_svg_syntax_repair_prompt,
    estimate_svg_quality,
    extract_svg_from_ai_output,
    validate_svg_xml,
)

logger = logging.getLogger(__name__)


async def generate_svg(
    text: str,
    provider: str,
    user_id: str,
    ai_service,
) -> dict:
    """Generate a validated SVG diagram from a text description.

    Parameters
    ----------
    text:       Plain-text diagram description.
    provider:   "coze" | "local_ollama"
    user_id:    Used as part of the Coze conversation ID.
    ai_service: An AIGatewayService instance.

    Returns
    -------
    dict with keys: svg, provider, draft_quality, refined, fallback_used, provider_switched
    """
    final_provider = provider
    chat_prompt = build_diagram_generation_prompt(text)

    # ── Pass 1: draft ─────────────────────────────────────────────────────────
    content = await ai_service.chat_with_provider(
        message=chat_prompt,
        context={"coze_user_id": f"sub4_{user_id}"},
        provider=provider,
    )

    draft_svg = extract_svg_from_ai_output(content)
    draft_quality = estimate_svg_quality(draft_svg)
    refined = False
    fallback_used = False
    provider_switched = False
    final_svg = draft_svg

    # ── Pass 2: refine low/medium quality drafts ──────────────────────────────
    if draft_quality < 9:
        refine_prompt = build_diagram_refine_prompt(text, draft_svg)
        try:
            refined_content = await ai_service.chat_with_provider(
                message=refine_prompt,
                context={"coze_user_id": f"sub4_refine_{user_id}"},
                provider=provider,
            )
            refined_svg = extract_svg_from_ai_output(refined_content)
            final_svg = refined_svg
            refined = True
        except Exception:
            logger.warning("Diagram refine pass failed; returning draft SVG", exc_info=True)

    # ── Pass 3: XML validation + repair ──────────────────────────────────────
    is_valid_xml, parse_err = validate_svg_xml(final_svg)
    if not is_valid_xml:
        logger.warning("Generated SVG XML invalid, attempting syntax repair: %s", parse_err)
        repair_prompt = build_svg_syntax_repair_prompt(final_svg, parse_err or "unknown parse error")
        repaired_content = await ai_service.chat_with_provider(
            message=repair_prompt,
            context={"coze_user_id": f"sub4_repair_{user_id}"},
            provider=provider,
        )
        repaired_svg = extract_svg_from_ai_output(repaired_content)
        repaired_ok, repaired_err = validate_svg_xml(repaired_svg)

        if repaired_ok:
            final_svg = repaired_svg
        else:
            logger.warning(
                "Repair attempt still malformed XML. Trying alternate provider: %s", repaired_err
            )

            # ── Pass 4: alternate provider ────────────────────────────────────
            alternate_provider = "coze" if provider == "local_ollama" else "local_ollama"
            try:
                alt_content = await ai_service.chat_with_provider(
                    message=chat_prompt,
                    context={"coze_user_id": f"sub4_alt_{user_id}"},
                    provider=alternate_provider,
                )
                alt_svg = extract_svg_from_ai_output(alt_content)
                alt_ok, alt_err = validate_svg_xml(alt_svg)

                if not alt_ok:
                    alt_repair_prompt = build_svg_syntax_repair_prompt(
                        alt_svg, alt_err or "unknown parse error"
                    )
                    alt_repair_content = await ai_service.chat_with_provider(
                        message=alt_repair_prompt,
                        context={"coze_user_id": f"sub4_alt_repair_{user_id}"},
                        provider=alternate_provider,
                    )
                    alt_repaired_svg = extract_svg_from_ai_output(alt_repair_content)
                    alt_repaired_ok, alt_repaired_err = validate_svg_xml(alt_repaired_svg)
                    if not alt_repaired_ok:
                        raise ValueError(
                            f"alternate provider svg still malformed: {alt_repaired_err}"
                        )
                    alt_svg = alt_repaired_svg

                final_svg = alt_svg
                final_provider = alternate_provider
                provider_switched = True

            except Exception as alt_exc:
                # ── Pass 5: deterministic fallback ────────────────────────────
                logger.warning(
                    "Alternate provider also failed. Using deterministic fallback SVG: %s", alt_exc
                )
                final_svg = build_fallback_svg(text)
                fallback_ok, fallback_err = validate_svg_xml(final_svg)
                if not fallback_ok:
                    raise ValueError(
                        f"Fallback SVG generation failed XML validation: {fallback_err}"
                    )
                fallback_used = True

    return {
        "svg": final_svg,
        "provider": final_provider,
        "draft_quality": draft_quality,
        "refined": refined,
        "fallback_used": fallback_used,
        "provider_switched": provider_switched,
    }
