from __future__ import annotations

from dataclasses import dataclass
from typing import List, Dict, Any
import re

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


@dataclass
class RetrievedChunk:
    chunk_id: int
    text: str
    score: float


class LocalRagService:
    """Lightweight local retriever for single-document RAG.

    This avoids introducing heavy infra and works well as a first step for
    grading assistant context grounding.
    """

    def __init__(self, chunk_size: int = 800, overlap: int = 120):
        self.chunk_size = chunk_size
        self.overlap = overlap

    def _normalize_whitespace(self, text: str) -> str:
        return re.sub(r"\s+", " ", (text or "")).strip()

    def chunk_text(self, text: str) -> List[str]:
        normalized = self._normalize_whitespace(text)
        if not normalized:
            return []

        chunks: List[str] = []
        start = 0
        n = len(normalized)
        while start < n:
            end = min(start + self.chunk_size, n)
            chunks.append(normalized[start:end])
            if end >= n:
                break
            start = max(end - self.overlap, start + 1)
        return chunks

    def retrieve(self, document_text: str, query: str, top_k: int = 4) -> List[RetrievedChunk]:
        chunks = self.chunk_text(document_text)
        clean_query = self._normalize_whitespace(query)
        if not chunks or not clean_query:
            return []

        # Fit over query + document chunks to keep vocabulary aligned.
        corpus = [clean_query] + chunks
        vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=1)
        matrix = vectorizer.fit_transform(corpus)

        query_vec = matrix[0]
        chunk_vecs = matrix[1:]
        sims = cosine_similarity(query_vec, chunk_vecs).flatten()

        ranked_idx = sims.argsort()[::-1][: max(1, top_k)]
        results: List[RetrievedChunk] = []
        for idx in ranked_idx:
            score = float(sims[idx])
            if score <= 0:
                continue
            results.append(RetrievedChunk(chunk_id=int(idx), text=chunks[idx], score=score))
        return results

    def build_rag_context(self, document_text: str, query: str, top_k: int = 4) -> Dict[str, Any]:
        retrieved = self.retrieve(document_text=document_text, query=query, top_k=top_k)
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
