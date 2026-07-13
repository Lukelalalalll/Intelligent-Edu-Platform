from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from ..indexing_job_extractors import ParsedDocumentResult


async def reuse_existing_index(
    *,
    course_id: str,
    filename: str,
    chapter_id: str,
    source_hash: str,
    normalized_hash: str,
    parsed: ParsedDocumentResult,
    index_version: str,
    artifact_refs: list[dict[str, str]],
    existing_job: dict,
) -> dict[str, object]:
    from backend.services.course_rag_service import course_rag_service

    diagnostics = course_rag_service.get_document_diagnostics(course_id, str(existing_job.get("filename") or filename))
    existing_doc_name = str(existing_job.get("filename") or filename)
    active_docs = {doc["doc_name"]: doc for doc in course_rag_service.list_indexed_documents(course_id)}
    existing_doc = active_docs.get(existing_doc_name)
    if not existing_doc:
        raise RuntimeError("Normalized duplicate found but no active document metadata to reuse")

    source_active_version = course_rag_service.active_index_version(course_id)
    source_docs_meta = course_rag_service._store_manager.documents_meta(course_id, source_active_version)
    source_doc_meta = dict(source_docs_meta.get(existing_doc_name) or {})
    if not source_doc_meta:
        raise RuntimeError("Source document metadata unavailable for normalized index reuse")

    chunk_ids = list(source_doc_meta.get("chunk_ids") or [])
    if not chunk_ids:
        raise RuntimeError("Source document metadata has no chunk ids to reuse")

    store = course_rag_service._store_manager.get_store(course_id, source_active_version)
    data = store.get(ids=chunk_ids, include=["documents", "metadatas"])
    docs = list(data.get("documents") or [])
    metas = list(data.get("metadatas") or [])
    ids = list(data.get("ids") or [])
    if not ids or len(ids) != len(docs):
        raise RuntimeError("Could not materialize normalized duplicate nodes for reuse")

    target_store = course_rag_service._store_manager.get_store(course_id, index_version)
    new_ids = []
    new_metadatas = []
    texts = []
    for source_id, source_text, source_meta in zip(ids, docs, metas):
        source_meta = dict(source_meta or {})
        chunk_stable_id = str(source_meta.get("chunk_stable_id") or source_id)
        new_id = f"{chunk_stable_id}:{filename}"
        new_meta = dict(source_meta)
        new_meta.update(
            {
                "doc_name": filename,
                "chapter_id": chapter_id,
                "index_version": index_version,
                "parser_used": parsed.parser_used,
            }
        )
        new_ids.append(new_id)
        new_metadatas.append(new_meta)
        texts.append(source_text)

    batch_size = 32
    for start in range(0, len(texts), batch_size):
        end = min(start + batch_size, len(texts))
        target_store.add_texts(
            texts=texts[start:end],
            ids=new_ids[start:end],
            metadatas=new_metadatas[start:end],
        )

    cloned_meta = course_rag_service._store_manager.clone_document_metadata(
        course_id,
        from_doc_name=existing_doc_name,
        to_doc_name=filename,
        index_version=index_version,
        overrides={
            "source_hash": source_hash,
            "normalized_hash": normalized_hash,
            "hash": normalized_hash,
            "chunk_ids": new_ids,
            "chapter_id": chapter_id,
            "indexed_at": datetime.now(timezone.utc).isoformat(),
            "index_version": index_version,
            "parser_used": parsed.parser_used,
            "parser_strategy": parsed.parser_strategy,
            "quality_report": parsed.quality_report,
            "artifact_refs": artifact_refs,
            "page_count": int(parsed.quality_report.get("page_count") or source_doc_meta.get("page_count") or 1),
            "build_status": "indexed",
        },
    )
    course_rag_service._store_manager.write_diagnostics(
        course_id,
        filename,
        {
            **diagnostics,
            "job_id": existing_job.get("job_id", ""),
            "course_id": course_id,
            "doc_name": filename,
            "parser_used": parsed.parser_used,
            "parser_strategy": parsed.parser_strategy,
            "fallback_chain": parsed.fallback_chain,
            "quality_report": parsed.quality_report,
            "artifact_refs": artifact_refs,
            "index_version": index_version,
            "reused_from_job_id": existing_job.get("job_id", ""),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    return {
        "indexed": True,
        "chunk_count": int(cloned_meta.get("chunk_count", 0) or 0),
        "index_version": index_version,
        "duplicate": False,
        "reused_normalized_index": True,
    }


async def verify_index_build(course_id: str, filename: str, index_version: str) -> dict[str, str | bool]:
    from backend.services.course_rag_service import course_rag_service

    docs = course_rag_service._store_manager.documents_meta(course_id, index_version)
    if filename not in docs:
        return {"ok": False, "error": "Indexed document missing from version metadata"}
    doc = docs[filename]
    if int(doc.get("chunk_count", 0) or 0) <= 0:
        return {"ok": False, "error": "Indexed document has zero nodes"}

    store = course_rag_service._store_manager.get_store(course_id, index_version)
    try:
        data = store.get(where={"doc_name": {"$eq": filename}}, include=["metadatas"])
    except Exception as exc:
        return {"ok": False, "error": f"Could not query built index: {exc}"}
    ids = data.get("ids") or []
    if not ids:
        return {"ok": False, "error": "No vector nodes found for indexed document"}
    return {"ok": True, "error": ""}


def build_source_hash(parsed: ParsedDocumentResult) -> str:
    return hashlib.sha256(parsed.text.encode("utf-8")).hexdigest()
