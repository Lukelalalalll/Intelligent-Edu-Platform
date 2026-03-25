from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List
import hashlib
import json

from langchain_huggingface import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma


@dataclass
class RetrievalItem:
    chunk_id: int
    text: str
    score: float


class LangChainRagService:
    """Submission-scoped persistent RAG service backed by Chroma."""

    def __init__(
        self,
        persist_root: str,
        embedding_model_name: str,
        chunk_size: int = 800,
        chunk_overlap: int = 120,
    ):
        self.persist_root = Path(persist_root)
        self.persist_root.mkdir(parents=True, exist_ok=True)
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.embedding_model_name = embedding_model_name
        self._embeddings = HuggingFaceEmbeddings(model_name=self.embedding_model_name)

    def _submission_dir(self, submission_id: str) -> Path:
        folder = self.persist_root / submission_id
        folder.mkdir(parents=True, exist_ok=True)
        return folder

    def _meta_path(self, submission_id: str) -> Path:
        return self._submission_dir(submission_id) / "meta.json"

    def _doc_hash(self, text: str) -> str:
        return hashlib.sha256((text or "").encode("utf-8")).hexdigest()

    def _load_meta(self, submission_id: str) -> Dict[str, Any]:
        path = self._meta_path(submission_id)
        if not path.exists():
            return {}
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}

    def _save_meta(self, submission_id: str, payload: Dict[str, Any]) -> None:
        path = self._meta_path(submission_id)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def _build_chunks(self, document_text: str) -> List[str]:
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
            separators=["\n\n", "\n", ". ", " ", ""],
        )
        return [chunk for chunk in splitter.split_text(document_text or "") if chunk.strip()]

    def _create_or_refresh_store(self, submission_id: str, document_text: str) -> Chroma:
        submission_dir = self._submission_dir(submission_id)
        meta = self._load_meta(submission_id)
        current_hash = self._doc_hash(document_text)
        persisted_hash = str(meta.get("document_hash") or "")

        store = Chroma(
            collection_name=f"submission_{submission_id}",
            embedding_function=self._embeddings,
            persist_directory=str(submission_dir),
        )

        if persisted_hash == current_hash:
            return store

        # Document changed or first build: clear old vectors and re-index.
        existing = store.get(include=[])
        existing_ids = existing.get("ids", [])
        if existing_ids:
            store.delete(ids=existing_ids)

        chunks = self._build_chunks(document_text=document_text)
        if chunks:
            ids = [f"{submission_id}_chunk_{idx}" for idx in range(len(chunks))]
            metadatas = [{"submission_id": submission_id, "chunk_id": idx} for idx in range(len(chunks))]
            store.add_texts(texts=chunks, ids=ids, metadatas=metadatas)

        self._save_meta(
            submission_id=submission_id,
            payload={
                "document_hash": current_hash,
                "chunk_count": len(chunks),
                "chunk_size": self.chunk_size,
                "chunk_overlap": self.chunk_overlap,
                "embedding_model": self.embedding_model_name,
            },
        )
        return store

    def retrieve(
        self,
        submission_id: str,
        document_text: str,
        query: str,
        top_k: int = 4,
    ) -> List[RetrievalItem]:
        if not document_text or not query.strip():
            return []

        store = self._create_or_refresh_store(submission_id=submission_id, document_text=document_text)
        docs_with_scores = store.similarity_search_with_relevance_scores(query=query, k=max(1, top_k))

        results: List[RetrievalItem] = []
        for idx, (doc, score) in enumerate(docs_with_scores):
            metadata = doc.metadata or {}
            chunk_id = int(metadata.get("chunk_id", idx))
            normalized_score = max(0.0, min(1.0, float(score)))
            results.append(
                RetrievalItem(
                    chunk_id=chunk_id,
                    text=doc.page_content,
                    score=normalized_score,
                )
            )
        return results

    def build_rag_context(
        self,
        submission_id: str,
        document_text: str,
        query: str,
        top_k: int = 4,
    ) -> Dict[str, Any]:
        retrieved = self.retrieve(
            submission_id=submission_id,
            document_text=document_text,
            query=query,
            top_k=top_k,
        )
        return {
            "retrieved_chunks": [
                {
                    "chunk_id": item.chunk_id,
                    "score": round(item.score, 4),
                    "text": item.text,
                }
                for item in retrieved
            ],
            "retrieved_count": len(retrieved),
        }
