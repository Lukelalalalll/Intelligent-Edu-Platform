"""Diagram generation service — multi-pass SVG generation with fallback."""
from __future__ import annotations

import logging
from typing import Any

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


async def _chat_for_diagram(
    *,
    ai_service,
    message: str,
    context: dict[str, Any],
    provider: str | None = None,
    runtime: Any | None = None,
) -> str:
    if runtime is not None:
        return await ai_service.chat_with_runtime(
            message=message,
            context=context,
            runtime=runtime,
            allow_fallback=False,
        )
    return await ai_service.chat_with_provider(
        message=message,
        context=context,
        provider=provider,
    )


async def _generate_svg_core(
    *,
    text: str,
    user_id: str,
    ai_service,
    provider: str | None = None,
    runtime: Any | None = None,
) -> dict:
    final_provider = str(getattr(runtime, "provider_id", "") or provider or "local_ollama")
    chat_prompt = build_diagram_generation_prompt(text)
    content = await _chat_for_diagram(
        ai_service=ai_service,
        message=chat_prompt,
        context={"coze_user_id": f"sub4_{user_id}"},
        provider=provider,
        runtime=runtime,
    )
    draft_svg = extract_svg_from_ai_output(content)
    draft_quality = estimate_svg_quality(draft_svg)
    refined = False
    fallback_used = False
    provider_switched = False
    final_svg = draft_svg

    if draft_quality < 9:
        refine_prompt = build_diagram_refine_prompt(text, draft_svg)
        try:
            refined_content = await _chat_for_diagram(
                ai_service=ai_service,
                message=refine_prompt,
                context={"coze_user_id": f"sub4_refine_{user_id}"},
                provider=provider,
                runtime=runtime,
            )
            final_svg = extract_svg_from_ai_output(refined_content)
            refined = True
        except Exception:
            logger.warning("Diagram refine pass failed; returning draft SVG", exc_info=True)

    is_valid_xml, parse_err = validate_svg_xml(final_svg)
    if not is_valid_xml:
        logger.warning("Generated SVG XML invalid, attempting syntax repair: %s", parse_err)
        repair_prompt = build_svg_syntax_repair_prompt(final_svg, parse_err or "unknown parse error")
        repaired_content = await _chat_for_diagram(
            ai_service=ai_service,
            message=repair_prompt,
            context={"coze_user_id": f"sub4_repair_{user_id}"},
            provider=provider,
            runtime=runtime,
        )
        repaired_svg = extract_svg_from_ai_output(repaired_content)
        repaired_ok, repaired_err = validate_svg_xml(repaired_svg)
        if repaired_ok:
            final_svg = repaired_svg
        elif runtime is not None:
            logger.warning("Runtime SVG repair failed. Using deterministic fallback SVG: %s", repaired_err)
            final_svg = build_fallback_svg(text)
            fallback_ok, fallback_err = validate_svg_xml(final_svg)
            if not fallback_ok:
                raise ValueError(f"Fallback SVG generation failed XML validation: {fallback_err}")
            fallback_used = True
        else:
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
                    alt_repair_prompt = build_svg_syntax_repair_prompt(alt_svg, alt_err or "unknown parse error")
                    alt_repair_content = await ai_service.chat_with_provider(
                        message=alt_repair_prompt,
                        context={"coze_user_id": f"sub4_alt_repair_{user_id}"},
                        provider=alternate_provider,
                    )
                    alt_repaired_svg = extract_svg_from_ai_output(alt_repair_content)
                    alt_repaired_ok, alt_repaired_err = validate_svg_xml(alt_repaired_svg)
                    if not alt_repaired_ok:
                        raise ValueError(f"alternate provider svg still malformed: {alt_repaired_err}")
                    alt_svg = alt_repaired_svg
                final_svg = alt_svg
                final_provider = alternate_provider
                provider_switched = True
            except Exception as alt_exc:
                logger.warning("Alternate provider also failed. Using deterministic fallback SVG: %s", alt_exc)
                final_svg = build_fallback_svg(text)
                fallback_ok, fallback_err = validate_svg_xml(final_svg)
                if not fallback_ok:
                    raise ValueError(f"Fallback SVG generation failed XML validation: {fallback_err}")
                fallback_used = True

    return {
        "svg": final_svg,
        "provider": final_provider,
        "provider_source": str(getattr(runtime, "config_source", "") or "legacy_provider"),
        "requested_provider": str(getattr(runtime, "requested_provider", "") or provider or ""),
        "model": str(getattr(runtime, "model", "") or "diagram-svg-generator"),
        "draft_quality": draft_quality,
        "refined": refined,
        "fallback_used": fallback_used,
        "provider_switched": provider_switched,
    }


async def generate_svg(text: str, provider: str, user_id: str, ai_service) -> dict:
    return await _generate_svg_core(
        text=text,
        provider=provider,
        user_id=user_id,
        ai_service=ai_service,
    )


async def generate_svg_with_runtime(text: str, runtime, user_id: str, ai_service) -> dict:
    return await _generate_svg_core(
        text=text,
        runtime=runtime,
        user_id=user_id,
        ai_service=ai_service,
    )


class DiagramService:
    """Agent-facing adapter around the SVG generator."""

    def __init__(self, *, provider: str = "local_ollama", user_id: str = "agent", ai_service=None):
        self.provider = provider
        self.user_id = user_id
        self.ai_service = ai_service

    async def generate(self, *, description: str, diagram_type: str = "flowchart") -> dict:
        from backend.services.ai_gateway_service import get_ai_gateway_service

        result = await generate_svg(
            text=description,
            provider=self.provider,
            user_id=self.user_id,
            ai_service=self.ai_service or get_ai_gateway_service(),
        )
        return {"svg": result["svg"], "url": "", "provider": result["provider"], "diagram_type": diagram_type}
