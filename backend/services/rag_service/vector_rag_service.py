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
    page_num: int = -1
    char_start: int = 0
    char_end: int = 0


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

    def _estimate_page_num(self, char_start: int, text: str) -> int:
        """Estimate page number from form-feed chars or character position."""
        prefix = text[:char_start]
        page_breaks = prefix.count("\f")
        if page_breaks > 0:
            return page_breaks + 1
        # Estimate ~3000 chars per page for non-paginated text
        return (char_start // 3000) + 1

    def _build_chunk_metadata(self, chunks: List[str], document_text: str, submission_id: str) -> List[dict]:
        """Build metadata dicts for each chunk including positional info."""
        metadatas = []
        search_start = 0
        for idx, chunk in enumerate(chunks):
            # Find approximate position in original text
            search_prefix = chunk[:80] if len(chunk) >= 80 else chunk
            pos = document_text.find(search_prefix, search_start) if document_text else -1
            char_start = pos if pos >= 0 else search_start
            char_end = char_start + len(chunk)
            page_num = self._estimate_page_num(char_start, document_text)
            search_start = max(char_start + 1, search_start)

            metadatas.append({
                "submission_id": submission_id,
                "chunk_id": idx,
                "page_num": page_num,
                "char_start": char_start,
                "char_end": char_end,
            })
        return metadatas

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
            metadatas = self._build_chunk_metadata(chunks, document_text, submission_id)
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

        # Use MMR retrieval for better diversity (reduces redundant chunks)
        try:
            docs_with_scores = store.max_marginal_relevance_search_with_score(
                query=query,
                k=max(1, top_k),
                fetch_k=max(top_k * 3, 12),
                lambda_mult=0.7,  # 0=max diversity, 1=max relevance
            )
        except (AttributeError, NotImplementedError):
            # Fallback to standard similarity search
            docs_with_scores = store.similarity_search_with_relevance_scores(query=query, k=max(1, top_k))

        results: List[RetrievalItem] = []
        for idx, (doc, score) in enumerate(docs_with_scores):
            metadata = doc.metadata or {}
            chunk_id = int(metadata.get("chunk_id", idx))
            normalized_score = max(0.0, min(1.0, float(score)))
            # Filter out very low relevance chunks
            if normalized_score < 0.05:
                continue
            results.append(
                RetrievalItem(
                    chunk_id=chunk_id,
                    text=doc.page_content,
                    score=normalized_score,
                    page_num=int(metadata.get("page_num", -1)),
                    char_start=int(metadata.get("char_start", 0)),
                    char_end=int(metadata.get("char_end", 0)),
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
                    "page_num": item.page_num,
                    "char_start": item.char_start,
                    "char_end": item.char_end,
                }
                for item in retrieved
            ],
            "retrieved_count": len(retrieved),
        }
