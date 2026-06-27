from __future__ import annotations

import base64
import json
import sys
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

_PRESENTON_RUNTIME_ROOT = Path(__file__).resolve().parents[1] / "presenton_runtime"
if str(_PRESENTON_RUNTIME_ROOT) not in sys.path:
    sys.path.insert(0, str(_PRESENTON_RUNTIME_ROOT))

from backend.services.student import student_assignment_service
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
