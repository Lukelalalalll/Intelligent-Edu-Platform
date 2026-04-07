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
    page_num: int = -1
    char_start: int = 0
    char_end: int = 0


class LocalRagService:
    """Lightweight local retriever for single-document RAG.

    Uses sentence-boundary-aware chunking and TF-IDF + cosine similarity
    for fast retrieval without external infra.
    """

    def __init__(self, chunk_size: int = 800, overlap: int = 120, min_score: float = 0.02):
        self.chunk_size = chunk_size
        self.overlap = overlap
        self.min_score = min_score

    def _normalize_whitespace(self, text: str) -> str:
        return re.sub(r"\s+", " ", (text or "")).strip()

    def _estimate_page_num(self, char_start: int, text: str) -> int:
        """Estimate page number based on form-feed characters or fixed-size pages."""
        prefix = text[:char_start]
        page_breaks = prefix.count("\f")
        if page_breaks > 0:
            return page_breaks + 1
        return (char_start // 3000) + 1

    def _split_sentences(self, text: str) -> list[str]:
        """Split text into sentences respecting common boundaries."""
        # Split on sentence-ending punctuation followed by space/newline
        parts = re.split(r'(?<=[.!?。！？\n])\s+', text)
        return [p.strip() for p in parts if p.strip()]

    def chunk_text(self, text: str) -> list[dict[str, Any]]:
        normalized = self._normalize_whitespace(text)
        if not normalized:
            return []

        sentences = self._split_sentences(normalized)
        if not sentences:
            return []

        chunks: list[dict[str, Any]] = []
        current_chunk: list[str] = []
        current_len = 0
        chunk_start = 0
        idx = 0
        pos = 0  # track position in normalized text

        for sent in sentences:
            sent_len = len(sent)
            if current_len + sent_len > self.chunk_size and current_chunk:
                # Emit current chunk
                chunk_text = " ".join(current_chunk)
                page_num = self._estimate_page_num(chunk_start, text)
                chunks.append({
                    "chunk_id": idx,
                    "text": chunk_text,
                    "char_start": chunk_start,
                    "char_end": chunk_start + len(chunk_text),
                    "page_num": page_num,
                })
                idx += 1

                # Keep overlap: re-use last sentences that fit within overlap budget
                overlap_sentences: list[str] = []
                overlap_len = 0
                for s in reversed(current_chunk):
                    if overlap_len + len(s) > self.overlap:
                        break
                    overlap_sentences.insert(0, s)
                    overlap_len += len(s)

                chunk_start = pos - overlap_len if overlap_len > 0 else pos
                current_chunk = overlap_sentences
                current_len = overlap_len

            current_chunk.append(sent)
            current_len += sent_len
            pos += sent_len + 1  # +1 for space

        # Emit final chunk
        if current_chunk:
            chunk_text = " ".join(current_chunk)
            page_num = self._estimate_page_num(chunk_start, text)
            chunks.append({
                "chunk_id": idx,
                "text": chunk_text,
                "char_start": chunk_start,
                "char_end": chunk_start + len(chunk_text),
                "page_num": page_num,
            })

        return chunks

    def retrieve(self, document_text: str, query: str, top_k: int = 4) -> List[RetrievedChunk]:
        chunks = self.chunk_text(document_text)
        clean_query = self._normalize_whitespace(query)
        if not chunks or not clean_query:
            return []

        chunk_texts = [c["text"] for c in chunks]

        # Fit over query + document chunks to keep vocabulary aligned.
        corpus = [clean_query] + chunk_texts
        vectorizer = TfidfVectorizer(
            ngram_range=(1, 2),
            min_df=1,
            max_features=10000,
            sublinear_tf=True,
        )
        matrix = vectorizer.fit_transform(corpus)

        query_vec = matrix[0]
        chunk_vecs = matrix[1:]
        sims = cosine_similarity(query_vec, chunk_vecs).flatten()

        ranked_idx = sims.argsort()[::-1][: max(1, top_k)]
        results: List[RetrievedChunk] = []
        for idx in ranked_idx:
            score = float(sims[idx])
            if score < self.min_score:
                continue
            chunk_meta = chunks[idx]
            results.append(RetrievedChunk(
                chunk_id=chunk_meta["chunk_id"],
                text=chunk_meta["text"],
                score=score,
                page_num=chunk_meta["page_num"],
                char_start=chunk_meta["char_start"],
                char_end=chunk_meta["char_end"],
            ))
        return results

    def build_rag_context(self, document_text: str, query: str, top_k: int = 4) -> Dict[str, Any]:
        retrieved = self.retrieve(document_text=document_text, query=query, top_k=top_k)
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
