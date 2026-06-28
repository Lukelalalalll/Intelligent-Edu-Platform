from __future__ import annotations


async def persist_success_history(
    *,
    user: dict | None,
    task_id: str,
    ppt_generator_task_service,
    persist_generate_v2_history_fn,
    req,
    runtime,
    title: str,
    result: dict,
    slides_results: list[dict] | None,
    pptx_filename: str,
    deck_manifest: dict | None,
    script_payload: dict | None,
    logger,
) -> None:
    if not user or not user.get("id"):
        return
    try:
        task = await ppt_generator_task_service.get_task(task_id)
        await persist_generate_v2_history_fn(
            user_id=user.get("id", ""),
            task=task,
            req=req,
            runtime=runtime,
            title=title,
            result=result,
            slides_results=slides_results,
            pptx_filename=pptx_filename,
            design_spec_url=deck_manifest["design_spec_url"] if deck_manifest else "",
            script_payload=script_payload,
        )
    except Exception:
        logger.warning("history_insert_failed tool=ppt_generator_generate_v2", exc_info=True)


async def persist_failure_history(
    *,
    user: dict | None,
    task_id: str,
    ppt_generator_task_service,
    persist_generate_v2_history_fn,
    req,
    runtime,
    title: str,
    result: dict,
    slides_results: list[dict] | None,
    pptx_filename: str,
    deck_manifest: dict | None,
    script_payload: dict | None,
    logger,
) -> None:
    if not user or not user.get("id"):
        return
    try:
        task = await ppt_generator_task_service.get_task(task_id)
        await persist_generate_v2_history_fn(
            user_id=user.get("id", ""),
            task=task,
            req=req,
            runtime=runtime,
            title=title,
            result=result,
            slides_results=slides_results,
            pptx_filename=pptx_filename,
            design_spec_url=deck_manifest["design_spec_url"] if deck_manifest else "",
            script_payload=script_payload,
        )
    except Exception:
        logger.warning("history_insert_failed tool=ppt_generator_generate_v2", exc_info=True)

