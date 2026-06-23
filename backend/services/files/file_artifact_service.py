from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable

from fastapi import HTTPException
from fastapi.responses import FileResponse


def resolve_artifact_path(filename: str, base_dir: str) -> Path:
    base = Path(base_dir).resolve()
    safe_name = os.path.basename(str(filename or ""))
    resolved = (base / safe_name).resolve()
    if not str(resolved).startswith(str(base) + os.sep):
        raise HTTPException(status_code=404, detail="File not found")
    return resolved


def find_first_existing_path(filename: str, base_dirs: Iterable[str]) -> Path | None:
    for base_dir in base_dirs:
        try:
            resolved = resolve_artifact_path(filename, base_dir)
        except HTTPException:
            continue
        if resolved.exists():
            return resolved
    return None


def build_file_response(path: Path, *, filename: str | None = None, media_type: str | None = None) -> FileResponse:
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(path), media_type=media_type, filename=filename or path.name)
