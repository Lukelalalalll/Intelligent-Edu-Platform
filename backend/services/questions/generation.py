"""LLM generation helpers for sub2."""

from __future__ import annotations

from typing import Any

from backend.services.ai_gateway_service import get_ai_gateway_service


async def call_provider_generate(
    *,
    base_content: str,
    user_requirements: str,
    question_type: str = "",
    provider: str | None = None,
    output_language: str = "Chinese",
    question_basis: str | None = None,
    knowledge_points: str = "",
    saved_screenshots: list[str] | None = None,
    target_question_count: int | None = None,
    runtime: Any | None = None,
) -> str:
    saved_screenshots = saved_screenshots or []
    basis_hint = ""
    if question_basis == "knowledge_points" and knowledge_points.strip():
        basis_hint = (
            f"\n[Knowledge Constraints]\n{knowledge_points.strip()}\n"
            "Please strictly generate questions around these knowledge points."
        )
    elif question_basis == "example_images" and saved_screenshots:
        basis_hint = (
            "\n[Reference Screenshots]\n"
            f"{len(saved_screenshots)} screenshots provided for style reference: {', '.join(saved_screenshots[:12])}\n"
            "Use them as style inspiration only; do not copy wording from source questions."
        )

    requested_count = None
    try:
        if target_question_count is not None:
            requested_count = max(1, int(target_question_count))
    except (TypeError, ValueError):
        requested_count = None

    count_rule_en = ""
    if requested_count:
        count_rule_en = (
            f"\n5) You must generate exactly {requested_count} questions "
            f"(no fewer, no more), numbered from 1 to {requested_count}."
        )

    qtype = str(question_type or "").strip().lower().replace("_", " ").replace("-", " ")
    fill_blank_examples_en = """
[Output Template - Fill-in-the-blank]
1. Question: In asynchronous SQLAlchemy, the utility used to create an async session factory is ____.
Answer: async_sessionmaker
Explanation: async_sessionmaker creates a factory for asynchronous session objects.

2. Question: In ACID properties, the "A" stands for ____.
Answer: Atomicity
Explanation: Atomicity ensures a transaction is all-or-nothing.
"""
    format_rule_en = ""
    if "fill" in qtype and "blank" in qtype:
        format_rule_en = (
            "\n[Strict Fill-in-the-blank Rules]\n"
            "- Every question stem MUST contain exactly one blank marker: ____\n"
            "- Never put the answer directly in the stem\n"
            "- Each question MUST include 'Answer:' and 'Explanation:' lines\n"
            "- Follow this format exactly:\n"
            "  n. Question: ... ____ ...\n"
            "  Answer: ...\n"
            "  Explanation: ...\n"
            f"\n{fill_blank_examples_en}"
        )

    is_english = str(output_language).strip().lower().startswith("english")
    if is_english:
        language_rule = (
            "Output the full question set in English only (stems, options, answers, and explanations). "
            "Do not use Chinese."
        )
    else:
        language_rule = "Output all question stems, options, answers, and explanations in Chinese."

    prompt = f"""You are an expert question designer. Generate a brand-new question set by transforming the source material below.
[Source Content]: {base_content}
[Generation Requirements]: {user_requirements}
[Question Type]: {question_type}
{basis_hint}
[Hard Constraints]
1) Include complete options, answers, and explanations.
2) Any math expressions must use LaTeX wrapped with $...$.
3) Do not copy wording from the source. Keep the same knowledge targets but change wording and numeric details.
4) {language_rule}{count_rule_en}
{format_rule_en}"""

    ai_service = get_ai_gateway_service()
    context = {"coze_user_id": "sub2_user"}
    if runtime is not None:
        return await ai_service.chat_with_runtime(
            message=prompt,
            context=context,
            runtime=runtime,
            allow_fallback=False,
        )
    if not provider:
        raise ValueError("provider or runtime is required for question generation")
    return await ai_service.chat_with_provider(
        message=prompt,
        context=context,
        provider=provider,
        allow_fallback=False,
    )
