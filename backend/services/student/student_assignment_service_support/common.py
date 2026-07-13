from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

from backend.repositories.course_section_repo import (
    find_course_section_by_code as find_course_section_by_code_repo,
)
from backend.repositories._helpers import coerce_object_id

MAX_SUBMISSION_FILE_SIZE = 50 * 1024 * 1024


def user_id_from_user(current_user: dict[str, Any]) -> str:
    return str(current_user.get("_id") or current_user.get("id") or "")


async def find_course_section_by_code(course_code: str) -> dict[str, Any] | None:
    return await find_course_section_by_code_repo(course_code)


async def resolve_course_section_id(course_section_id: str) -> str:
    if coerce_object_id(course_section_id) is not None:
        return course_section_id

    section = await find_course_section_by_code(course_section_id)
    return str(section["id"]) if section else course_section_id


def submission_upload_root() -> Path:
    return Path(__file__).resolve().parents[2] / "uploads" / "submissions"


def save_submission_file(*, user_id: str, assignment_id: str, filename: str, content: bytes) -> tuple[Path, str, str]:
    upload_dir = submission_upload_root()
    upload_dir.mkdir(parents=True, exist_ok=True)

    checksum = hashlib.sha256(content).hexdigest()
    file_hash = checksum[:16]
    safe_filename = f"{user_id}_{assignment_id}_{file_hash}_{filename}"
    file_path = upload_dir / safe_filename
    file_path.write_bytes(content)
    return file_path, f"uploads/submissions/{safe_filename}", checksum


__all__ = [
    "MAX_SUBMISSION_FILE_SIZE",
    "find_course_section_by_code",
    "resolve_course_section_id",
    "save_submission_file",
    "submission_upload_root",
    "user_id_from_user",
]
