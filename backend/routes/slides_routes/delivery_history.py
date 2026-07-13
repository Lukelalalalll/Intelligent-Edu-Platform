from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from backend.config import Config


def attach_pptx_export(deck_manifest: dict, pptx_filename: str) -> dict:
    exports = {
        "pptx": {
            "available": True,
            "kind": "native_pptx",
            "source": "ppt_schema",
            "filename": pptx_filename,
            "download_url": f"/api/slides/download_ppt/{pptx_filename}",
        }
    }
    deck_manifest["exports"] = exports
    manifest_path = Path(Config.PPT_RESULTS_FOLDER) / "svg_decks" / deck_manifest["deck_id"] / "manifest.json"
    manifest_path.write_text(json.dumps(deck_manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return exports


def to_iso(ts: float | int | None) -> str | None:
    if ts is None:
        return None
    try:
        return datetime.fromtimestamp(float(ts), tz=timezone.utc).isoformat()
    except Exception:
        return None


def build_ppt_generator_source(req, *, title: str, request_id: str) -> dict:
    source_kind = (req.source_kind or "").strip() or "text"
    source_filename = str(req.source_filename or "").strip()
    source_display_name = str(req.source_display_name or "").strip()
    combined_filename = str(req.combined_markdown_filename or "").strip()
    source: dict[str, object] = {
        "kind": source_kind,
        "title": title,
        "request_id": request_id,
    }
    if source_filename:
        source["source_filename"] = source_filename
        source["source_download_url"] = f"/api/slides/download_source/{source_filename}"
    if source_display_name:
        source["source_display_name"] = source_display_name
    if combined_filename:
        source["combined_markdown_filename"] = combined_filename
        source["combined_markdown_download_url"] = f"/api/slides/download/{combined_filename}"
    return source


def build_ppt_generator_result_artifacts(
    *,
    title: str,
    request_id: str,
    slides_results: list[dict] | None,
    pptx_filename: str = "",
    design_spec_url: str = "",
    script_payload: dict | None = None,
) -> dict:
    result: dict[str, object] = {
        "request_id": request_id,
        "title": title,
        "page_count": len(slides_results or []),
        "pptx_filename": pptx_filename,
        "pptx_download_url": f"/api/slides/download_ppt/{pptx_filename}" if pptx_filename else "",
        "html_preview_filename": "",
        "html_preview_url": "",
    }
    if design_spec_url:
        result["design_spec_url"] = design_spec_url
    if script_payload and isinstance(script_payload.get("word_document"), dict):
        word_document = script_payload["word_document"]
        result["script_doc_filename"] = word_document.get("filename", "")
        result["script_doc_download_url"] = word_document.get("download_url", "")
    return result


def build_workflow_snapshot(task: dict | None, *, task_type: str = "ppt_generator_generate_v2") -> dict | None:
    if not isinstance(task, dict):
        return None
    events = task.get("events") or []
    if not isinstance(events, list):
        events = []
    steps_map: dict[str, dict] = {}
    ordered_steps: list[str] = []
    for event in events:
        if not isinstance(event, dict):
            continue
        step_name = str(event.get("step") or "").strip() or "unknown"
        ts = event.get("ts")
        entry = steps_map.get(step_name)
        if entry is None:
            entry = {
                "step": step_name,
                "status": "running",
                "latency_ms": 0,
                "started_at": to_iso(ts),
                "ended_at": to_iso(ts),
                "metadata": {},
            }
            steps_map[step_name] = entry
            ordered_steps.append(step_name)
        if ts is not None:
            if not entry.get("started_at"):
                entry["started_at"] = to_iso(ts)
            entry["ended_at"] = to_iso(ts)
            started_dt = entry.get("started_at")
            ended_dt = entry.get("ended_at")
            if started_dt and ended_dt:
                try:
                    start_ts = datetime.fromisoformat(started_dt).timestamp()
                    end_ts = datetime.fromisoformat(ended_dt).timestamp()
                    entry["latency_ms"] = max(0, round((end_ts - start_ts) * 1000))
                except Exception:
                    pass
        event_type = str(event.get("type") or "")
        message = str(event.get("message") or "")
        payload = event.get("payload")
        metadata = entry.setdefault("metadata", {})
        if message:
            metadata["message"] = message
        if isinstance(payload, dict) and payload:
            metadata.update(payload)
        if event_type == "step_done":
            entry["status"] = "success"
        elif event_type == "step_error":
            entry["status"] = "failed"
            if message:
                entry["error"] = message
        elif event_type == "step_progress" and entry.get("status") != "success":
            entry["status"] = "running"

    total_latency_ms = None
    if task.get("created_at") is not None and task.get("updated_at") is not None:
        try:
            total_latency_ms = max(0, round((float(task["updated_at"]) - float(task["created_at"])) * 1000))
        except Exception:
            total_latency_ms = None

    return {
        "request_id": task.get("request_id"),
        "task_id": task.get("task_id"),
        "task_type": task_type,
        "status": task.get("status"),
        "created_at": to_iso(task.get("created_at")),
        "updated_at": to_iso(task.get("updated_at")),
        "total_latency_ms": total_latency_ms,
        "steps": [steps_map[name] for name in ordered_steps],
    }


def build_ppt_generator_history_params(
    *,
    req,
    runtime,
    request_id: str,
    task_id: str,
    deck_id: str = "",
    title: str = "",
) -> dict:
    return {
        "tool": "ppt_generator_generate_v2",
        "provider": req.provider or "auto",
        "provider_requested": runtime.requested_provider,
        "provider_resolved": runtime.provider_id,
        "provider_source": runtime.config_source,
        "provider_model": runtime.model,
        "model": runtime.model,
        "title": title,
        "presentation_title": title,
        "total_pages": req.total_pages,
        "num_of_bullets": req.num_of_bullets,
        "words_each_bullet": req.words_each_bullet,
        "generate_talking_script": req.generate_talking_script,
        "generate_word_document": req.generate_word_document,
        "script_style": req.script_style,
        "theme": req.theme or "",
        "source_kind": req.source_kind or "text",
        "source_filename": req.source_filename or "",
        "source_display_name": req.source_display_name or "",
        "combined_markdown_filename": req.combined_markdown_filename or "",
        "request_id": request_id,
        "task_id": task_id,
        "deck_id": deck_id,
    }


async def persist_generate_v2_history(
    *,
    user_id: str,
    task: dict | None,
    req,
    runtime,
    title: str,
    result: dict,
    save_ppt_generator_history,
    slides_results: list[dict] | None = None,
    pptx_filename: str = "",
    design_spec_url: str = "",
    script_payload: dict | None = None,
) -> None:
    request_id = str((task or {}).get("request_id") or "")
    task_id = str((task or {}).get("task_id") or "")
    workflow = build_workflow_snapshot(task)
    source = build_ppt_generator_source(req, title=title, request_id=request_id)
    source["workflow"] = workflow
    source["result_artifacts"] = build_ppt_generator_result_artifacts(
        title=title,
        request_id=request_id,
        slides_results=slides_results,
        pptx_filename=pptx_filename,
        design_spec_url=design_spec_url,
        script_payload=script_payload,
    )
    params = build_ppt_generator_history_params(
        req=req,
        runtime=runtime,
        request_id=request_id,
        task_id=task_id,
        deck_id=str(result.get("deck_id") or ""),
        title=title,
    )
    preview = str(result.get("error") or "").strip()
    if not preview:
        artifacts = source.get("result_artifacts")
        page_count = artifacts.get("page_count", 0) if isinstance(artifacts, dict) else 0
        preview = f"PPT Generator generated {page_count} slides with {runtime.provider_id}"
    await save_ppt_generator_history(
        user_id=user_id,
        params=params,
        result_preview=preview,
        result_full=result,
        source=source,
    )

