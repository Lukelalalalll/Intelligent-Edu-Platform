from __future__ import annotations

import base64
import json
import sys
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from bson import ObjectId

_PRESENTON_RUNTIME_ROOT = Path(__file__).resolve().parents[1] / "presenton_runtime"
if str(_PRESENTON_RUNTIME_ROOT) not in sys.path:
    sys.path.insert(0, str(_PRESENTON_RUNTIME_ROOT))

from backend.services.student import student_assignment_service
from backend.services.student.student_assignment_service_support import assignment_queries
from backend.services.student.student_assignment_service_support import submission_flow
from models.image_prompt import ImagePrompt
from services import image_generation_service
from services.image_generation_service_support import common as image_common
from utils.asset_directory_utils import absolute_fastapi_asset_url
from utils.oauth.openai_codex import get_account_profile, parse_authorization_input


def _fake_jwt(payload: dict) -> str:
    def encode_part(value: dict) -> str:
        raw = json.dumps(value, separators=(",", ":")).encode("utf-8")
        return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")

    return ".".join(
        [
            encode_part({"alg": "none", "typ": "JWT"}),
            encode_part(payload),
            "sig",
        ]
    )


def test_parse_authorization_input_accepts_url_and_shorthand():
    parsed_url = parse_authorization_input(
        "http://localhost:1455/auth/callback?code=abc123&state=xyz789"
    )
    parsed_shorthand = parse_authorization_input("abc123#xyz789")

    assert parsed_url == {"code": "abc123", "state": "xyz789"}
    assert parsed_shorthand == {"code": "abc123", "state": "xyz789"}


def test_get_account_profile_merges_access_and_id_tokens():
    access_token = _fake_jwt(
        {
            "https://api.openai.com/auth": {
                "chatgpt_account_id": "acct_123",
                "chatgpt_plan_type": "pro",
            },
            "https://api.openai.com/profile": {
                "email": "owner@example.com",
            },
        }
    )
    id_token = _fake_jwt(
        {
            "name": "Ada Lovelace",
            "email": "ignored@example.com",
            "https://api.openai.com/auth": {
                "chatgpt_account_id": "acct_123",
            },
        }
    )

    profile = get_account_profile(access_token, id_token)

    assert profile.account_id == "acct_123"
    assert profile.username == "Ada Lovelace"
    assert profile.email == "owner@example.com"
    assert profile.is_pro is True


def test_image_generation_service_selects_openai_compatible_provider(monkeypatch, tmp_path):
    monkeypatch.setattr(image_generation_service, "is_image_generation_disabled", lambda: False)
    monkeypatch.setattr(image_common, "is_pixabay_selected", lambda: False)
    monkeypatch.setattr(image_common, "is_pixels_selected", lambda: False)
    monkeypatch.setattr(image_common, "is_gemini_flash_selected", lambda: False)
    monkeypatch.setattr(image_common, "is_nanobanana_pro_selected", lambda: False)
    monkeypatch.setattr(image_common, "is_dalle3_selected", lambda: False)
    monkeypatch.setattr(image_common, "is_gpt_image_1_5_selected", lambda: False)
    monkeypatch.setattr(image_common, "is_comfyui_selected", lambda: False)
    monkeypatch.setattr(image_common, "is_open_webui_selected", lambda: False)
    monkeypatch.setattr(image_common, "is_openai_compatible_selected", lambda: True)

    service = image_generation_service.ImageGenerationService(str(tmp_path))

    assert service.image_gen_func.__name__ == "generate_image_openai_compatible"


@pytest.mark.asyncio
async def test_image_generation_service_returns_placeholder_when_disabled(monkeypatch, tmp_path):
    monkeypatch.setattr(image_generation_service, "is_image_generation_disabled", lambda: True)

    service = image_generation_service.ImageGenerationService(str(tmp_path))
    result = await service.generate_image(ImagePrompt(prompt="City skyline"))

    assert result == absolute_fastapi_asset_url("/static/images/placeholder.jpg")


@pytest.mark.asyncio
async def test_submit_student_assignment_preserves_legacy_submission_shape(monkeypatch, tmp_path):
    fake_file = tmp_path / "submission.pdf"
    fake_file.write_bytes(b"pdf")

    monkeypatch.setattr(submission_flow, "get_assignment", AsyncMock(return_value=None))
    monkeypatch.setattr(
        submission_flow,
        "load_legacy_homework",
        AsyncMock(return_value={"course_id": "course-1"}),
    )
    monkeypatch.setattr(
        submission_flow,
        "ensure_course_membership",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        submission_flow,
        "save_submission_file",
        lambda **_kwargs: (fake_file, "uploads/submissions/submission.pdf", "checksum"),
    )
    monkeypatch.setattr(
        submission_flow,
        "upsert_legacy_submission",
        AsyncMock(return_value={"id": "legacy-1", "status": "submitted"}),
    )

    result = await student_assignment_service.submit_student_assignment(
        assignment_id="legacy-homework",
        filename="submission.pdf",
        content=b"pdf",
        mime_type="application/pdf",
        current_user={"id": "student-1", "username": "alice"},
    )

    assert result == {
        "message": "Submission uploaded successfully",
        "submission": {"id": "legacy-1", "status": "submitted"},
        "document": None,
    }


@pytest.mark.asyncio
async def test_submit_student_assignment_updates_document_owner_via_repo_helper(monkeypatch, tmp_path):
    fake_file = tmp_path / "submission.pdf"
    fake_file.write_bytes(b"pdf")
    document_id = str(ObjectId())

    monkeypatch.setattr(
        submission_flow,
        "get_assignment",
        AsyncMock(return_value={"id": "assignment-1", "courseSectionId": "course-1"}),
    )
    monkeypatch.setattr(
        submission_flow,
        "ensure_course_membership",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        submission_flow,
        "save_submission_file",
        lambda **_kwargs: (fake_file, "uploads/submissions/submission.pdf", "checksum"),
    )
    monkeypatch.setattr(
        submission_flow,
        "create_document",
        AsyncMock(
            return_value={
                "id": document_id,
                "ownerType": "submission",
                "ownerId": "",
                "storageKey": "uploads/submissions/submission.pdf",
                "filename": "submission.pdf",
            }
        ),
    )
    monkeypatch.setattr(
        submission_flow,
        "create_submission",
        AsyncMock(
            return_value={
                "id": "submission-1",
                "assignmentId": "assignment-1",
                "latestDocumentId": document_id,
                "status": "pending",
            }
        ),
    )
    set_document_owner = AsyncMock(return_value=True)
    register_file_asset = AsyncMock(return_value=None)
    monkeypatch.setattr(submission_flow, "set_document_owner", set_document_owner)
    monkeypatch.setattr(submission_flow, "register_file_asset", register_file_asset)

    result = await student_assignment_service.submit_student_assignment(
        assignment_id="assignment-1",
        filename="submission.pdf",
        content=b"pdf",
        mime_type="application/pdf",
        current_user={"id": "student-1", "username": "alice"},
    )

    assert set_document_owner.await_args.args == (document_id, "submission-1")
    assert register_file_asset.await_args.kwargs["metadata"] == {
        "assignmentId": "assignment-1",
        "submissionId": "submission-1",
    }
    assert result == {
        "message": "Submission uploaded successfully",
        "submission": {
            "id": "submission-1",
            "assignmentId": "assignment-1",
            "latestDocumentId": document_id,
            "status": "pending",
        },
        "document": {
            "id": document_id,
            "ownerType": "submission",
            "ownerId": "",
            "storageKey": "uploads/submissions/submission.pdf",
            "filename": "submission.pdf",
        },
    }


@pytest.mark.asyncio
async def test_list_student_assignments_preserves_legacy_homework_fallback(monkeypatch):
    monkeypatch.setattr(
        assignment_queries,
        "resolve_course_section_id",
        AsyncMock(return_value="section-1"),
    )
    monkeypatch.setattr(
        assignment_queries,
        "list_all_assignments",
        AsyncMock(
            return_value=[
                {
                    "id": "assignment-1",
                    "title": "V2 Assignment",
                    "description": "Solve it",
                    "homeworkId": "legacy-skip",
                }
            ]
        ),
    )
    monkeypatch.setattr(
        assignment_queries,
        "list_all_submissions_for_student",
        AsyncMock(
            return_value=[
                {
                    "id": "submission-1",
                    "assignmentId": "assignment-1",
                    "status": "pending",
                }
            ]
        ),
    )
    monkeypatch.setattr(
        assignment_queries,
        "get_grade",
        AsyncMock(
            return_value={
                "totalScore": 95,
                "rubricScores": {"content": 95},
                "overallFeedback": "Great job",
                "gradingStatus": "final",
            }
        ),
    )
    monkeypatch.setattr(
        assignment_queries,
        "load_legacy_homework_submission_map",
        AsyncMock(
            return_value={
                "legacy-keep": {
                    "file_name": "legacy.pdf",
                    "submitted_at": "2026-06-01T00:00:00Z",
                    "status": "submitted",
                }
            }
        ),
    )
    list_legacy_homeworks_by_course = AsyncMock(
        return_value=[
            {
                "_id": "legacy-skip",
                "title": "Synced Homework",
                "description": "already represented by v2",
                "deadline": "2026-07-01",
                "required_file_types": [".pdf"],
            },
            {
                "_id": "legacy-keep",
                "title": "Legacy Homework",
                "description": "legacy fallback",
                "deadline": "2026-07-02",
                "required_file_types": [".pdf"],
            },
        ]
    )
    monkeypatch.setattr(
        assignment_queries,
        "list_legacy_homeworks_by_course",
        list_legacy_homeworks_by_course,
    )

    result = await assignment_queries.list_student_assignments(
        "CS101",
        {"id": "student-1"},
    )

    assert list_legacy_homeworks_by_course.await_args.args == ("section-1",)
    assert [item["id"] for item in result["assignments"]] == ["assignment-1", "legacy-keep"]
    assert result["assignments"][0]["status"] == "graded"
    assert result["assignments"][0]["grade"]["totalScore"] == 95
    assert result["assignments"][1]["_legacyHomework"] is True
    assert result["assignments"][1]["submission"] == {
        "pdfPath": "legacy.pdf",
        "submittedAt": "2026-06-01",
    }
