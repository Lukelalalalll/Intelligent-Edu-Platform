from __future__ import annotations

from pathlib import Path

from backend.config import Config
from backend.repositories import file_asset_repo

from .shared import normalize_path


async def run_audit() -> dict:
    orphan_disk_files: list[dict] = []
    dangling_registry: list[dict] = []

    base_dirs = [
        ("chat_attachment", Path(Config.BASE_DIR) / "static" / "chat_files"),
        ("submission_pdf", Path(Config.BASE_DIR) / "uploads" / "submissions"),
        ("knowledge_source", Path(Config.BASE_DIR) / "uploads" / "knowledge_base"),
    ]

    known_paths: set[str] = set()
    for document in await file_asset_repo.list_non_hard_deleted_assets(
        projection={"storage_path": 1, "file_id": 1, "file_type": 1}
    ):
        path = normalize_path(str(document.get("storage_path", "")))
        if path:
            known_paths.add(path)

    for file_type, root in base_dirs:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            rel = path.relative_to(Path(Config.BASE_DIR)).as_posix()
            if rel not in known_paths:
                orphan_disk_files.append({"file_type": file_type, "storage_path": rel, "size": path.stat().st_size})

    for document in await file_asset_repo.list_non_hard_deleted_assets():
        rel = normalize_path(str(document.get("storage_path", "")))
        abs_path = Path(Config.BASE_DIR) / rel
        if not abs_path.exists():
            dangling_registry.append(
                {
                    "file_id": str(document.get("file_id", "")),
                    "file_type": str(document.get("file_type", "")),
                    "storage_path": rel,
                }
            )

    return {
        "orphan_disk_files": orphan_disk_files,
        "dangling_registry": dangling_registry,
        "counts": {
            "orphan_disk_files": len(orphan_disk_files),
            "dangling_registry": len(dangling_registry),
        },
    }
