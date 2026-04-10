from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.core.database import db
from backend.core.security import get_current_user
from backend.routes.auth_routes import get_profile_courses
from backend.services.course_rag_service import course_rag_service


diagnostic_router = APIRouter(prefix="/api/diagnostic", tags=["Diagnostic"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _to_jsonable(value: Any) -> Any:
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list):
        return [_to_jsonable(v) for v in value]
    if isinstance(value, dict):
        return {k: _to_jsonable(v) for k, v in value.items()}
    return value


def _user_id(user: dict) -> str:
    return str(user.get("_id") or user.get("id") or "")


async def _assert_teacher_owns_course(user: dict, course_id: str) -> None:
    if user.get("role") == "admin":
        return
    if user.get("role") != "teacher":
        raise HTTPException(status_code=403, detail="Teacher permission required")

    profile = await get_profile_courses(user)
    owned = {str(c.get("courseId") or c.get("id") or "") for c in profile.get("courses", [])}
    if course_id not in owned:
        raise HTTPException(status_code=403, detail="You do not own this course")


async def _assert_student_has_course(user: dict, course_id: str) -> None:
    if user.get("role") not in ("student", "teacher", "admin"):
        raise HTTPException(status_code=403, detail="Invalid role")

    profile = await get_profile_courses(user)
    course_ids = {str(c.get("courseId") or c.get("id") or "") for c in profile.get("courses", [])}
    if course_id not in course_ids and user.get("role") not in ("teacher", "admin"):
        raise HTTPException(status_code=403, detail="You are not enrolled in this course")


class ChapterCreatePayload(BaseModel):
    chapter_name: str = Field(..., min_length=1, max_length=120)
    chapter_order: int = 1
    description: str = Field(default="", max_length=1000)
    diagnostic_enabled: bool = True


class ChapterUpdatePayload(BaseModel):
    chapter_name: str | None = Field(default=None, min_length=1, max_length=120)
    chapter_order: int | None = None
    description: str | None = Field(default=None, max_length=1000)
    diagnostic_enabled: bool | None = None


class ConfigPayload(BaseModel):
    question_count: int = Field(default=5, ge=3, le=12)
    pass_score: float = Field(default=70.0, ge=0.0, le=100.0)
    time_limit_minutes: int = Field(default=20, ge=5, le=120)


class StartSessionPayload(BaseModel):
    course_id: str = Field(..., min_length=1)
    chapter_id: str = Field(..., min_length=1)


class SubmitAnswerItem(BaseModel):
    question_id: str
    answer: str = Field(default="", max_length=4000)


class SubmitSessionPayload(BaseModel):
    answers: list[SubmitAnswerItem]


class TeacherCommentPayload(BaseModel):
    comment: str = Field(..., min_length=1, max_length=2000)


class FeedbackPayload(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: str = Field(default="", max_length=1200)


class ReassignKnowledgePayload(BaseModel):
    course_id: str = Field(..., min_length=1)
    doc_name: str = Field(..., min_length=1)
    chapter_id: str = Field(..., min_length=1)


@diagnostic_router.get("/teacher/chapters/{course_id}")
async def teacher_list_chapters(course_id: str, user: dict = Depends(get_current_user)):
    await _assert_teacher_owns_course(user, course_id)
    rows = db.diagnostic_chapters.find({"course_id": course_id}).sort("chapter_order", 1)
    data = [_to_jsonable(row) async for row in rows]
    return {"course_id": course_id, "chapters": data}


@diagnostic_router.post("/teacher/chapters/{course_id}")
async def teacher_create_chapter(course_id: str, payload: ChapterCreatePayload, user: dict = Depends(get_current_user)):
    await _assert_teacher_owns_course(user, course_id)
    now = _utcnow()
    chapter_id = uuid.uuid4().hex[:20]
    doc = {
        "chapter_id": chapter_id,
        "course_id": course_id,
        "chapter_name": payload.chapter_name.strip(),
        "chapter_order": int(payload.chapter_order),
        "description": payload.description.strip(),
        "diagnostic_enabled": bool(payload.diagnostic_enabled),
        "created_by": _user_id(user),
        "created_at": now,
        "updated_at": now,
    }
    await db.diagnostic_chapters.insert_one(doc)

    config_doc = {
        "config_id": uuid.uuid4().hex[:20],
        "course_id": course_id,
        "chapter_id": chapter_id,
        "question_count": 5,
        "pass_score": 70.0,
        "time_limit_minutes": 20,
        "created_by": _user_id(user),
        "created_at": now,
        "updated_at": now,
    }
    await db.diagnostic_configs.insert_one(config_doc)
    return {"ok": True, "chapter": _to_jsonable(doc), "config": _to_jsonable(config_doc)}


@diagnostic_router.patch("/teacher/chapter/{chapter_id}")
async def teacher_update_chapter(chapter_id: str, payload: ChapterUpdatePayload, user: dict = Depends(get_current_user)):
    chapter = await db.diagnostic_chapters.find_one({"chapter_id": chapter_id})
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    await _assert_teacher_owns_course(user, str(chapter.get("course_id") or ""))

    updates: dict[str, Any] = {}
    if payload.chapter_name is not None:
        updates["chapter_name"] = payload.chapter_name.strip()
    if payload.chapter_order is not None:
        updates["chapter_order"] = int(payload.chapter_order)
    if payload.description is not None:
        updates["description"] = payload.description.strip()
    if payload.diagnostic_enabled is not None:
        updates["diagnostic_enabled"] = bool(payload.diagnostic_enabled)
    updates["updated_at"] = _utcnow()

    await db.diagnostic_chapters.update_one({"chapter_id": chapter_id}, {"$set": updates})
    updated = await db.diagnostic_chapters.find_one({"chapter_id": chapter_id})
    return {"ok": True, "chapter": _to_jsonable(updated)}


@diagnostic_router.delete("/teacher/chapter/{chapter_id}")
async def teacher_delete_chapter(chapter_id: str, user: dict = Depends(get_current_user)):
    chapter = await db.diagnostic_chapters.find_one({"chapter_id": chapter_id})
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    await _assert_teacher_owns_course(user, str(chapter.get("course_id") or ""))

    await db.diagnostic_chapters.delete_one({"chapter_id": chapter_id})
    await db.diagnostic_configs.delete_many({"chapter_id": chapter_id})
    return {"ok": True}


@diagnostic_router.get("/teacher/config/{chapter_id}")
async def teacher_get_config(chapter_id: str, user: dict = Depends(get_current_user)):
    chapter = await db.diagnostic_chapters.find_one({"chapter_id": chapter_id})
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    await _assert_teacher_owns_course(user, str(chapter.get("course_id") or ""))

    cfg = await db.diagnostic_configs.find_one({"chapter_id": chapter_id})
    if not cfg:
        raise HTTPException(status_code=404, detail="Config not found")
    return {"config": _to_jsonable(cfg)}


@diagnostic_router.put("/teacher/config/{chapter_id}")
async def teacher_update_config(chapter_id: str, payload: ConfigPayload, user: dict = Depends(get_current_user)):
    chapter = await db.diagnostic_chapters.find_one({"chapter_id": chapter_id})
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    await _assert_teacher_owns_course(user, str(chapter.get("course_id") or ""))

    now = _utcnow()
    await db.diagnostic_configs.update_one(
        {"chapter_id": chapter_id},
        {
            "$set": {
                "course_id": str(chapter.get("course_id") or ""),
                "question_count": int(payload.question_count),
                "pass_score": float(payload.pass_score),
                "time_limit_minutes": int(payload.time_limit_minutes),
                "updated_at": now,
                "updated_by": _user_id(user),
            },
            "$setOnInsert": {
                "config_id": uuid.uuid4().hex[:20],
                "created_by": _user_id(user),
                "created_at": now,
            },
        },
        upsert=True,
    )
    cfg = await db.diagnostic_configs.find_one({"chapter_id": chapter_id})
    return {"ok": True, "config": _to_jsonable(cfg)}


@diagnostic_router.get("/teacher/reports/{course_id}")
async def teacher_list_reports(course_id: str, chapter_id: str = "", user: dict = Depends(get_current_user)):
    await _assert_teacher_owns_course(user, course_id)
    query: dict[str, Any] = {"course_id": course_id}
    if chapter_id:
        query["chapter_id"] = chapter_id
    rows = db.diagnostic_reports.find(query).sort("created_at", -1)
    return {"reports": [_to_jsonable(r) async for r in rows]}


@diagnostic_router.post("/teacher/reports/{report_id}/comment")
async def teacher_comment_report(report_id: str, payload: TeacherCommentPayload, user: dict = Depends(get_current_user)):
    report = await db.diagnostic_reports.find_one({"report_id": report_id})
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    await _assert_teacher_owns_course(user, str(report.get("course_id") or ""))

    now = _utcnow()
    await db.diagnostic_reports.update_one(
        {"report_id": report_id},
        {
            "$set": {
                "teacher_comment": payload.comment.strip(),
                "teacher_comment_by": _user_id(user),
                "updated_at": now,
            }
        },
    )
    updated = await db.diagnostic_reports.find_one({"report_id": report_id})
    return {"ok": True, "report": _to_jsonable(updated)}


@diagnostic_router.get("/teacher/feedback/{course_id}")
async def teacher_list_feedback(
    course_id: str,
    chapter_id: str = "",
    report_id: str = "",
    min_rating: int = 1,
    user: dict = Depends(get_current_user),
):
    await _assert_teacher_owns_course(user, course_id)

    report_query: dict[str, Any] = {"course_id": course_id}
    if chapter_id:
        report_query["chapter_id"] = chapter_id
    if report_id:
        report_query["report_id"] = report_id

    report_rows = await db.diagnostic_reports.find(report_query).to_list(length=5000)
    if not report_rows:
        return {"feedback": []}

    report_map = {str(r.get("report_id") or ""): r for r in report_rows if str(r.get("report_id") or "")}
    target_report_ids = [rid for rid in report_map.keys() if rid]

    feedback_query: dict[str, Any] = {"report_id": {"$in": target_report_ids}}
    min_rating_safe = max(1, min(5, int(min_rating or 1)))
    if min_rating_safe > 1:
        feedback_query["rating"] = {"$gte": min_rating_safe}

    rows = db.diagnostic_feedback.find(feedback_query).sort("created_at", -1)
    feedback_items: list[dict[str, Any]] = []
    async for row in rows:
        rid = str(row.get("report_id") or "")
        report = report_map.get(rid) or {}

        student_id = str(row.get("student_id") or report.get("student_id") or "")
        student_name = ""
        if student_id:
            try:
                user_doc = None
                if ObjectId.is_valid(student_id):
                    user_doc = await db.users.find_one({"_id": ObjectId(student_id)}, {"username": 1})
                if not user_doc:
                    user_doc = await db.users.find_one({"id": student_id}, {"username": 1})
                student_name = str((user_doc or {}).get("username") or "")
            except Exception:
                student_name = ""

        feedback_items.append(
            {
                "feedback_id": str(row.get("feedback_id") or ""),
                "report_id": rid,
                "session_id": str(row.get("session_id") or ""),
                "course_id": str(report.get("course_id") or course_id),
                "chapter_id": str(report.get("chapter_id") or ""),
                "student_id": student_id,
                "student_name": student_name,
                "rating": int(row.get("rating") or 0),
                "comment": str(row.get("comment") or ""),
                "report_score": float(report.get("overall_score") or 0.0),
                "report_level": str(report.get("level") or ""),
                "created_at": _to_jsonable(row.get("created_at")),
            }
        )

    return {"feedback": feedback_items}


@diagnostic_router.post("/teacher/knowledge/reassign")
async def teacher_reassign_knowledge(payload: ReassignKnowledgePayload, user: dict = Depends(get_current_user)):
    await _assert_teacher_owns_course(user, payload.course_id)

    chapter = await db.diagnostic_chapters.find_one(
        {"chapter_id": payload.chapter_id, "course_id": payload.course_id}
    )
    if not chapter:
        raise HTTPException(status_code=404, detail="Target chapter not found")

    course_rag_service.assign_document_chapter(
        course_id=payload.course_id,
        doc_name=payload.doc_name,
        chapter_id=payload.chapter_id,
    )

    now = _utcnow()
    await db.file_assets.update_many(
        {
            "file_type": "knowledge_source",
            "course_id": payload.course_id,
            "filename": payload.doc_name,
            "status": {"$ne": "hard_deleted"},
        },
        {
            "$set": {
                "updated_at": now,
                "metadata.chapter_id": payload.chapter_id,
            }
        },
    )

    await db.indexing_jobs.update_many(
        {
            "course_id": payload.course_id,
            "filename": payload.doc_name,
        },
        {
            "$set": {
                "chapter_id": payload.chapter_id,
                "updated_at": now,
            }
        },
    )
    return {"ok": True}


def _tokens(text: str) -> set[str]:
    words = re.findall(r"[a-zA-Z0-9_\u4e00-\u9fff]+", str(text or "").lower())
    return {w for w in words if len(w) >= 2}


def _build_questions(chunks: list[dict[str, Any]], count: int, chapter_name: str) -> list[dict[str, Any]]:
    questions: list[dict[str, Any]] = []
    seen: set[str] = set()

    for item in chunks:
        text = str(item.get("text") or "").strip()
        if not text:
            continue
        snippet = text[:280].strip()
        if snippet in seen:
            continue
        seen.add(snippet)
        qid = uuid.uuid4().hex[:10]
        questions.append(
            {
                "question_id": qid,
                "prompt": f"[{chapter_name}] Explain the key idea in your own words: {snippet[:120]}...",
                "reference": snippet,
                "max_score": 10.0,
                "doc_name": item.get("doc_name", ""),
            }
        )
        if len(questions) >= count:
            break

    while len(questions) < count:
        qid = uuid.uuid4().hex[:10]
        questions.append(
            {
                "question_id": qid,
                "prompt": f"[{chapter_name}] Summarize one important concept from this chapter and give an example.",
                "reference": chapter_name,
                "max_score": 10.0,
                "doc_name": "",
            }
        )
    return questions


def _evaluate_answer(reference: str, answer: str, max_score: float) -> tuple[float, str]:
    answer = str(answer or "").strip()
    if not answer:
        return 0.0, "No answer provided."

    ref_tokens = _tokens(reference)
    ans_tokens = _tokens(answer)
    if not ref_tokens:
        base = min(1.0, len(ans_tokens) / 25.0)
    else:
        base = len(ref_tokens & ans_tokens) / max(1, len(ref_tokens))

    length_bonus = min(0.2, len(answer) / 800.0)
    raw = min(1.0, base + length_bonus)
    score = round(raw * max_score, 2)

    if score >= max_score * 0.8:
        fb = "Strong explanation with good keyword coverage."
    elif score >= max_score * 0.5:
        fb = "Partially correct. Add more chapter terminology and concrete examples."
    else:
        fb = "Needs improvement. Review chapter notes and use key terms more precisely."
    return score, fb


@diagnostic_router.get("/student/chapters/{course_id}")
async def student_list_chapters(course_id: str, user: dict = Depends(get_current_user)):
    await _assert_student_has_course(user, course_id)
    rows = db.diagnostic_chapters.find({"course_id": course_id, "diagnostic_enabled": True}).sort("chapter_order", 1)
    return {"course_id": course_id, "chapters": [_to_jsonable(r) async for r in rows]}


@diagnostic_router.post("/student/sessions/start")
async def student_start_session(payload: StartSessionPayload, user: dict = Depends(get_current_user)):
    await _assert_student_has_course(user, payload.course_id)
    chapter = await db.diagnostic_chapters.find_one(
        {
            "chapter_id": payload.chapter_id,
            "course_id": payload.course_id,
            "diagnostic_enabled": True,
        }
    )
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found or disabled")

    config = await db.diagnostic_configs.find_one({"chapter_id": payload.chapter_id}) or {
        "question_count": 5,
        "pass_score": 70.0,
        "time_limit_minutes": 20,
    }

    chapter_name = str(chapter.get("chapter_name") or "Chapter")
    student_id = _user_id(user)
    retrieve_count = max(6, int(config.get("question_count", 5)) * 2)
    chunks = course_rag_service.retrieve_for_student(
        student_id=student_id,
        query=f"{chapter_name} key concepts summary",
        top_k=retrieve_count,
        course_ids=[payload.course_id],
        chapter_id=payload.chapter_id,
    )
    questions = _build_questions(chunks=chunks, count=int(config.get("question_count", 5)), chapter_name=chapter_name)

    now = _utcnow()
    session_id = uuid.uuid4().hex[:20]
    session = {
        "session_id": session_id,
        "course_id": payload.course_id,
        "chapter_id": payload.chapter_id,
        "student_id": student_id,
        "status": "in_progress",
        "questions": questions,
        "answers": [],
        "started_at": now,
        "updated_at": now,
        "submitted_at": None,
        "report_id": "",
        "time_limit_minutes": int(config.get("time_limit_minutes", 20)),
        "pass_score": float(config.get("pass_score", 70.0)),
    }
    await db.diagnostic_sessions.insert_one(session)

    return {
        "session_id": session_id,
        "course_id": payload.course_id,
        "chapter_id": payload.chapter_id,
        "time_limit_minutes": session["time_limit_minutes"],
        "questions": [
            {
                "question_id": q["question_id"],
                "prompt": q["prompt"],
                "max_score": q["max_score"],
            }
            for q in questions
        ],
    }


@diagnostic_router.get("/student/sessions/{session_id}")
async def student_get_session(session_id: str, user: dict = Depends(get_current_user)):
    session = await db.diagnostic_sessions.find_one({"session_id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if str(session.get("student_id") or "") != _user_id(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    return {"session": _to_jsonable(session)}


@diagnostic_router.post("/student/sessions/{session_id}/submit")
async def student_submit_session(session_id: str, payload: SubmitSessionPayload, user: dict = Depends(get_current_user)):
    session = await db.diagnostic_sessions.find_one({"session_id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if str(session.get("student_id") or "") != _user_id(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    if str(session.get("status") or "") == "completed":
        report = await db.diagnostic_reports.find_one({"report_id": session.get("report_id")})
        return {"ok": True, "already_submitted": True, "report": _to_jsonable(report)}

    answer_map = {item.question_id: item.answer for item in payload.answers}
    evaluated: list[dict[str, Any]] = []
    total_score = 0.0
    total_max = 0.0

    for q in session.get("questions", []):
        max_score = float(q.get("max_score", 10.0) or 10.0)
        score, feedback = _evaluate_answer(
            reference=str(q.get("reference") or q.get("prompt") or ""),
            answer=answer_map.get(str(q.get("question_id") or ""), ""),
            max_score=max_score,
        )
        total_score += score
        total_max += max_score
        evaluated.append(
            {
                "question_id": q.get("question_id"),
                "prompt": q.get("prompt"),
                "answer": answer_map.get(str(q.get("question_id") or ""), ""),
                "score": score,
                "max_score": max_score,
                "feedback": feedback,
                "doc_name": q.get("doc_name", ""),
            }
        )

    percent = round((total_score / max(1.0, total_max)) * 100.0, 2)
    if percent >= 85:
        level = "excellent"
    elif percent >= 70:
        level = "good"
    elif percent >= 50:
        level = "developing"
    else:
        level = "at_risk"

    strengths = [e["prompt"] for e in evaluated if float(e.get("score", 0.0)) >= float(e.get("max_score", 10.0)) * 0.8][:3]
    weaknesses = [e["prompt"] for e in evaluated if float(e.get("score", 0.0)) < float(e.get("max_score", 10.0)) * 0.5][:3]
    recommendations = [
        "Review the chapter summary and rewrite each concept in your own words.",
        "Practice with one new example per key concept.",
        "Retry this diagnostic after revision to compare progress.",
    ]

    report_id = uuid.uuid4().hex[:20]
    now = _utcnow()
    report_doc = {
        "report_id": report_id,
        "session_id": session_id,
        "course_id": session.get("course_id", ""),
        "chapter_id": session.get("chapter_id", ""),
        "student_id": session.get("student_id", ""),
        "overall_score": percent,
        "level": level,
        "strengths": strengths,
        "weaknesses": weaknesses,
        "recommendations": recommendations,
        "question_results": evaluated,
        "teacher_comment": "",
        "created_at": now,
        "updated_at": now,
    }
    await db.diagnostic_reports.insert_one(report_doc)

    await db.diagnostic_sessions.update_one(
        {"session_id": session_id},
        {
            "$set": {
                "status": "completed",
                "answers": evaluated,
                "submitted_at": now,
                "updated_at": now,
                "report_id": report_id,
            }
        },
    )

    return {"ok": True, "report": _to_jsonable(report_doc)}


@diagnostic_router.get("/student/reports")
async def student_list_reports(course_id: str = "", user: dict = Depends(get_current_user)):
    student_id = _user_id(user)
    query: dict[str, Any] = {"student_id": student_id}
    if course_id:
        query["course_id"] = course_id
    rows = db.diagnostic_reports.find(query).sort("created_at", -1)
    return {"reports": [_to_jsonable(r) async for r in rows]}


@diagnostic_router.get("/student/reports/{report_id}")
async def student_get_report(report_id: str, user: dict = Depends(get_current_user)):
    report = await db.diagnostic_reports.find_one({"report_id": report_id})
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if str(report.get("student_id") or "") != _user_id(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    return {"report": _to_jsonable(report)}


@diagnostic_router.post("/student/reports/{report_id}/feedback")
async def student_feedback_report(report_id: str, payload: FeedbackPayload, user: dict = Depends(get_current_user)):
    report = await db.diagnostic_reports.find_one({"report_id": report_id})
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if str(report.get("student_id") or "") != _user_id(user):
        raise HTTPException(status_code=403, detail="Forbidden")

    now = _utcnow()
    feedback = {
        "feedback_id": uuid.uuid4().hex[:20],
        "report_id": report_id,
        "session_id": report.get("session_id", ""),
        "student_id": _user_id(user),
        "rating": int(payload.rating),
        "comment": payload.comment.strip(),
        "created_at": now,
    }
    await db.diagnostic_feedback.insert_one(feedback)
    return {"ok": True, "feedback": _to_jsonable(feedback)}
