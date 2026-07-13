"""Per-course vector store and metadata management for course RAG."""
from __future__ import annotations

import json
import logging
import shutil
import threading
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, List

from backend.config import Config

from backend.services.course_rag_service.embedding_provider import CourseRagEmbeddingProvider

if TYPE_CHECKING:
    try:
        from langchain_chroma import Chroma
    except ImportError:
        from langchain_community.vectorstores import Chroma  # type: ignore[no-redef]

logger = logging.getLogger(__name__)

DEFAULT_SCHEMA_VERSION = int(getattr(Config, "RAG_INDEX_SCHEMA_VERSION", 2) or 2)


class CourseRagStoreManager:
    """Owns course directories, metadata files, and Chroma store lifecycle."""

    _store_cache: Dict[tuple[str, str], Any] = {}
    _store_lock = threading.Lock()

    def __init__(self, *, persist_root: Path, embedding_provider: CourseRagEmbeddingProvider):
        self.persist_root = persist_root
        self.persist_root.mkdir(parents=True, exist_ok=True)
        self._embedding_provider = embedding_provider
        self._meta_locks: Dict[str, threading.Lock] = {}
        self._meta_locks_mutex = threading.Lock()

    def course_dir(self, course_id: str) -> Path:
        folder = self.persist_root / course_id
        folder.mkdir(parents=True, exist_ok=True)
        return folder

    def builds_dir(self, course_id: str) -> Path:
        path = self.course_dir(course_id) / "builds"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def build_dir(self, course_id: str, index_version: str) -> Path:
        path = self.builds_dir(course_id) / str(index_version)
        path.mkdir(parents=True, exist_ok=True)
        return path

    def meta_path(self, course_id: str) -> Path:
        return self.course_dir(course_id) / "meta.json"

    def diagnostics_dir(self, course_id: str) -> Path:
        path = self.course_dir(course_id) / "diagnostics"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def get_meta_lock(self, course_id: str) -> threading.Lock:
        with self._meta_locks_mutex:
            if course_id not in self._meta_locks:
                self._meta_locks[course_id] = threading.Lock()
            return self._meta_locks[course_id]

    def load_meta(self, course_id: str) -> Dict[str, Any]:
        path = self.meta_path(course_id)
        if not path.exists():
            return self._default_meta()
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            payload = self._default_meta()
        return self._normalize_meta(payload)

    def save_meta(self, course_id: str, payload: Dict[str, Any]) -> None:
        normalized = self._normalize_meta(payload)
        path = self.meta_path(course_id)
        path.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")

    def active_index_version(self, course_id: str) -> str:
        meta = self.load_meta(course_id)
        active = str(meta.get("active_index_version") or "").strip()
        if active:
            return active
        versions = sorted((meta.get("index_versions") or {}).keys())
        return versions[-1] if versions else "v1"

    def begin_index_version(self, course_id: str) -> tuple[str, dict[str, Any]]:
        meta = self.load_meta(course_id)
        versions = list((meta.get("index_versions") or {}).keys())
        max_num = 0
        for version in versions:
            if version.startswith("v") and version[1:].isdigit():
                max_num = max(max_num, int(version[1:]))
        next_version = f"v{max_num + 1}"
        version_meta = {
            "build_status": "building",
            "created_at": self._now_iso(),
            "updated_at": self._now_iso(),
            "schema_version": DEFAULT_SCHEMA_VERSION,
            "doc_count": 0,
            "total_nodes": 0,
        }
        meta.setdefault("index_versions", {})[next_version] = version_meta
        self.save_meta(course_id, meta)
        return next_version, version_meta

    def finalize_index_version(
        self,
        course_id: str,
        index_version: str,
        *,
        documents: dict[str, Any],
        total_nodes: int,
        build_status: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        meta = self.load_meta(course_id)
        version_meta = dict((meta.get("index_versions") or {}).get(index_version) or {})
        version_meta.update(
            {
                "build_status": build_status,
                "updated_at": self._now_iso(),
                "schema_version": DEFAULT_SCHEMA_VERSION,
                "doc_count": len(documents),
                "total_nodes": total_nodes,
                "documents": documents,
            }
        )
        if metadata:
            version_meta.update(metadata)
        meta.setdefault("index_versions", {})[index_version] = version_meta
        self.save_meta(course_id, meta)
        return version_meta

    def activate_index_version(self, course_id: str, index_version: str) -> None:
        meta = self.load_meta(course_id)
        if index_version not in (meta.get("index_versions") or {}):
            raise KeyError(f"Unknown index version {index_version} for course {course_id}")
        meta["active_index_version"] = index_version
        meta["updated_at"] = self._now_iso()
        self.save_meta(course_id, meta)

    def mark_index_version_failed(self, course_id: str, index_version: str, *, error: str) -> None:
        meta = self.load_meta(course_id)
        version_meta = dict((meta.get("index_versions") or {}).get(index_version) or {})
        version_meta.update(
            {
                "build_status": "failed",
                "error": str(error or "Index build failed"),
                "updated_at": self._now_iso(),
            }
        )
        meta.setdefault("index_versions", {})[index_version] = version_meta
        self.save_meta(course_id, meta)

    def get_store(self, course_id: str, index_version: str | None = None) -> Any:
        version = str(index_version or self.active_index_version(course_id))
        cache_key = (course_id, version)
        with self._store_lock:
            if cache_key not in self._store_cache:
                self._store_cache[cache_key] = self._build_store(course_id, version)
            return self._store_cache[cache_key]

    def clear_store_cache(self, course_id: str, index_version: str | None = None) -> None:
        with self._store_lock:
            if index_version is not None:
                self._store_cache.pop((course_id, str(index_version)), None)
                return
            keys = [key for key in self._store_cache if key[0] == course_id]
            for key in keys:
                self._store_cache.pop(key, None)

    def remove_index_version(self, course_id: str, index_version: str) -> None:
        self.clear_store_cache(course_id, index_version)
        build_dir = self.build_dir(course_id, index_version)
        if build_dir.exists():
            shutil.rmtree(build_dir, ignore_errors=True)

    def get_all_indexed_courses(self) -> List[str]:
        courses: List[str] = []
        if not self.persist_root.exists():
            return courses
        for child in self.persist_root.iterdir():
            if child.is_dir():
                meta = self.load_meta(child.name)
                docs = self.documents_meta(child.name)
                if docs:
                    courses.append(child.name)
        return courses

    def documents_meta(self, course_id: str, index_version: str | None = None) -> dict[str, Any]:
        meta = self.load_meta(course_id)
        version = str(index_version or self.active_index_version(course_id))
        version_meta = dict((meta.get("index_versions") or {}).get(version) or {})
        legacy_documents = meta.get("documents", {})
        documents = version_meta.get("documents")
        if isinstance(documents, dict):
            return documents
        if isinstance(legacy_documents, dict):
            return legacy_documents
        return {}

    def diagnostics_path(self, course_id: str, doc_name: str) -> Path:
        safe_name = doc_name.replace("/", "_").replace("\\", "_")
        return self.diagnostics_dir(course_id) / f"{safe_name}.json"

    def write_diagnostics(self, course_id: str, doc_name: str, payload: dict[str, Any]) -> None:
        path = self.diagnostics_path(course_id, doc_name)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def read_diagnostics(self, course_id: str, doc_name: str) -> dict[str, Any]:
        path = self.diagnostics_path(course_id, doc_name)
        if not path.exists():
            return {}
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}

    def clone_document_metadata(
        self,
        course_id: str,
        *,
        from_doc_name: str,
        to_doc_name: str,
        index_version: str,
        overrides: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        meta = self.load_meta(course_id)
        version_meta = dict((meta.get("index_versions") or {}).get(index_version) or {})
        documents = dict(version_meta.get("documents") or {})
        source = dict(documents.get(from_doc_name) or {})
        if not source:
            raise KeyError(f"Document metadata {from_doc_name} not found for {course_id}/{index_version}")
        source.update(overrides or {})
        documents[to_doc_name] = source
        version_meta["documents"] = documents
        meta.setdefault("index_versions", {})[index_version] = version_meta
        self.save_meta(course_id, meta)
        return source

    def get_index_summary(self) -> List[Dict[str, Any]]:
        summary: List[Dict[str, Any]] = []
        if not self.persist_root.exists():
            return summary
        for child in self.persist_root.iterdir():
            if child.is_dir():
                docs = self.documents_meta(child.name)
                if not docs:
                    continue
                total_chunks = sum(int(d.get("chunk_count", 0) or 0) for d in docs.values())
                active_version = self.active_index_version(child.name)
                summary.append(
                    {
                        "course_id": child.name,
                        "doc_count": len(docs),
                        "total_chunks": total_chunks,
                        "active_index_version": active_version,
                    }
                )
        return summary

    def _build_store(self, course_id: str, index_version: str) -> Any:
        try:
            from langchain_chroma import Chroma
        except ImportError:
            from langchain_community.vectorstores import Chroma  # type: ignore[no-redef]

        persist_dir = self.build_dir(course_id, index_version)
        collection_name = f"course_{course_id}_{index_version}"
        try:
            return Chroma(
                collection_name=collection_name,
                embedding_function=self._embedding_provider.embeddings,
                persist_directory=str(persist_dir),
                collection_metadata={"hnsw:space": "cosine"},
            )
        except BaseException as exc:
            logger.warning(
                "Corrupted ChromaDB store for course %s version %s: %s - backing up data dir and rebuilding",
                course_id,
                index_version,
                exc,
            )
            backup_dir = persist_dir.with_suffix(".bak")
            if backup_dir.exists():
                shutil.rmtree(backup_dir, ignore_errors=True)
            try:
                persist_dir.rename(backup_dir)
            except OSError:
                shutil.rmtree(persist_dir, ignore_errors=True)
            persist_dir.mkdir(parents=True, exist_ok=True)
            return Chroma(
                collection_name=collection_name,
                embedding_function=self._embedding_provider.embeddings,
                persist_directory=str(persist_dir),
                collection_metadata={"hnsw:space": "cosine"},
            )

    def _default_meta(self) -> dict[str, Any]:
        return {
            "schema_version": DEFAULT_SCHEMA_VERSION,
            "engine": "chroma",
            "active_index_version": "",
            "index_versions": {},
            "documents": {},
            "updated_at": self._now_iso(),
        }

    def _normalize_meta(self, payload: dict[str, Any]) -> dict[str, Any]:
        meta = dict(payload or {})
        meta.setdefault("schema_version", DEFAULT_SCHEMA_VERSION)
        meta.setdefault("engine", "chroma")
        meta.setdefault("active_index_version", "")
        meta.setdefault("index_versions", {})
        meta.setdefault("documents", {})
        meta.setdefault("updated_at", self._now_iso())

        if meta.get("documents") and not meta["index_versions"]:
            legacy_docs = dict(meta.get("documents") or {})
            meta["index_versions"] = {
                "v1": {
                    "build_status": "active",
                    "schema_version": int(meta.get("schema_version") or DEFAULT_SCHEMA_VERSION),
                    "documents": legacy_docs,
                    "doc_count": len(legacy_docs),
                    "total_nodes": sum(int(doc.get("chunk_count", 0) or 0) for doc in legacy_docs.values()),
                    "created_at": meta.get("updated_at", self._now_iso()),
                    "updated_at": meta.get("updated_at", self._now_iso()),
                }
            }
            if not meta.get("active_index_version"):
                meta["active_index_version"] = "v1"

        active_version = str(meta.get("active_index_version") or "").strip()
        active_documents = {}
        if active_version:
            active_documents = dict(((meta.get("index_versions") or {}).get(active_version) or {}).get("documents") or {})
        if active_documents:
            meta["documents"] = active_documents

        return meta

    def _now_iso(self) -> str:
        from datetime import datetime, timezone

        return datetime.now(timezone.utc).isoformat()
