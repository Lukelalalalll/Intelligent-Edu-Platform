from __future__ import annotations

import logging
from pathlib import Path

from backend.config import Config
from backend.services.files.file_asset_service import register_file_asset

from ..indexing_job_extractors import ParsedDocumentArtifact

logger = logging.getLogger(__name__)


def persist_source_file(*, course_id: str, job_id: str, filename: str, content_bytes: bytes) -> Path:
    from .job_store import build_source_abs_path, build_source_rel_path, ensure_course_upload_dir

    ensure_course_upload_dir(course_id)
    source_rel_path = build_source_rel_path(course_id=course_id, job_id=job_id, filename=filename)
    source_abs_path = build_source_abs_path(course_id=course_id, job_id=job_id, filename=filename)
    source_abs_path.write_bytes(content_bytes)
    return source_rel_path


async def register_source_asset(
    *,
    source_rel_path: Path,
    file_size: int,
    job_id: str,
    filename: str,
    course_id: str,
    user_id: str,
    content_hash: str,
    chapter_id: str,
) -> None:
    try:
        await register_file_asset(
            file_type="knowledge_source",
            storage_path=source_rel_path.as_posix(),
            size=file_size,
            owner_type="knowledge_document",
            owner_id=job_id,
            created_by=user_id,
            filename=filename,
            course_id=course_id,
            scope="knowledge",
            user_id=user_id,
            metadata={
                "job_id": job_id,
                "content_hash": content_hash,
                "chapter_id": chapter_id,
            },
        )
    except Exception:
        logger.exception("Failed to register knowledge source file asset")


async def register_artifacts(
    *,
    course_id: str,
    job_id: str,
    user_id: str,
    filename: str,
    artifacts: list[ParsedDocumentArtifact],
    normalized_hash: str,
) -> list[dict[str, str]]:
    artifact_refs: list[dict[str, str]] = []
    course_dir = Path(Config.KNOWLEDGE_BASE_UPLOAD_DIR) / course_id / "artifacts" / job_id
    course_dir.mkdir(parents=True, exist_ok=True)

    for artifact in artifacts:
        suffix = ".json" if artifact.kind.endswith("json") else ".md"
        artifact_name = f"{artifact.kind}{suffix}"
        artifact_rel = Path("uploads") / "knowledge_base" / course_id / "artifacts" / job_id / artifact_name
        artifact_abs = Path(Config.BASE_DIR) / artifact_rel
        artifact_abs.write_text(artifact.content, encoding="utf-8")
        try:
            asset = await register_file_asset(
                file_type=f"knowledge_{artifact.kind}",
                storage_path=artifact_rel.as_posix(),
                size=len(artifact.content.encode("utf-8")),
                owner_type="knowledge_document",
                owner_id=job_id,
                created_by=user_id,
                filename=f"{filename}:{artifact.filename}",
                course_id=course_id,
                scope="knowledge",
                user_id=user_id,
                metadata={"job_id": job_id, "normalized_hash": normalized_hash, "artifact_kind": artifact.kind},
            )
            artifact_refs.append(
                {
                    "kind": artifact.kind,
                    "file_id": str(asset.get("file_id") or ""),
                    "storage_path": artifact_rel.as_posix(),
                }
            )
        except Exception:
            logger.exception("Failed to register artifact asset for %s", artifact.filename)
            artifact_refs.append({"kind": artifact.kind, "file_id": "", "storage_path": artifact_rel.as_posix()})
    return artifact_refs
