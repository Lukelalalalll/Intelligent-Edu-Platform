from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException

from backend.repositories import slides_delivery_job_repo


async def create_delivery_job(*, payload, user: dict) -> dict:
    slides = payload.ppt_schema.get("slides", []) if isinstance(payload.ppt_schema, dict) else []
    if not slides:
        raise HTTPException(status_code=400, detail="ppt_schema.slides is required")

    now = datetime.now(timezone.utc)
    job_id = uuid.uuid4().hex[:14]

    agenda: list[str] = []
    speaker_notes: list[dict] = []
    in_class_questions: list[dict] = []
    homework: list[dict] = []
    for idx, slide in enumerate(slides, start=1):
        title = str(slide.get("title") or f"Slide {idx}")
        agenda.append(f"{idx}. {title}")
        speaker_notes.append(
            {
                "slide": idx,
                "title": title,
                "note": f"Explain the core idea of '{title}' in 60-90 seconds, then connect it to the previous point.",
            }
        )
        in_class_questions.append(
            {
                "slide": idx,
                "question": f"What is the most important takeaway from '{title}'?",
                "expected_depth": "short_reasoning",
            }
        )
        homework.append(
            {
                "task_id": f"HW-{idx}",
                "prompt": f"Write a concise reflection on '{title}' and include one practical example.",
                "estimated_minutes": 12,
            }
        )

    artifacts = {
        "agenda": agenda,
        "speaker_notes": speaker_notes,
        "in_class_questions": in_class_questions,
        "homework_suggestions": homework,
    }
    document = {
        "job_id": job_id,
        "user_id": str(user.get("id", "")),
        "title": payload.title,
        "status": "completed",
        "locale": payload.locale,
        "script_style": payload.script_style,
        "slides_count": len(slides),
        "artifacts": artifacts,
        "created_at": now,
        "updated_at": now,
    }
    await slides_delivery_job_repo.insert_job(document)
    return {
        "success": True,
        "job_id": job_id,
        "status": "completed",
        "slides_count": len(slides),
        "artifacts_preview": {
            "agenda_count": len(agenda),
            "speaker_notes_count": len(speaker_notes),
            "in_class_questions_count": len(in_class_questions),
            "homework_count": len(homework),
        },
    }


async def get_delivery_job(*, job_id: str, user: dict) -> dict:
    document = await slides_delivery_job_repo.find_job(
        job_id=job_id,
        user_id=str(user.get("id", "")),
        projection={"_id": 0},
    )
    if not document:
        raise HTTPException(status_code=404, detail="Slides delivery job not found")
    for key in ("created_at", "updated_at"):
        if hasattr(document.get(key), "isoformat"):
            document[key] = document[key].isoformat()
    return {"success": True, "job": document}


async def get_delivery_artifact(*, job_id: str, artifact_type: str, user: dict) -> dict:
    document = await slides_delivery_job_repo.find_job(
        job_id=job_id,
        user_id=str(user.get("id", "")),
        projection={"_id": 0, "artifacts": 1},
    )
    if not document:
        raise HTTPException(status_code=404, detail="Slides delivery job not found")
    artifacts = document.get("artifacts", {})
    if artifact_type not in artifacts:
        raise HTTPException(status_code=404, detail="Artifact type not found")
    return {
        "success": True,
        "job_id": job_id,
        "artifact_type": artifact_type,
        "data": artifacts.get(artifact_type),
    }
