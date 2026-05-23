from __future__ import annotations

from dataclasses import dataclass
from typing import List, Dict, Any
import re

from rank_bm25 import BM25Okapi
import numpy as np


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

    Uses sentence-boundary-aware chunking and BM25 (Okapi BM25, Robertson
    et al. 2009) for fast retrieval without external infra.  BM25 improves
    on TF-IDF by incorporating document-length normalisation (parameters
    k1 and b), which is fairer for corpora with variable-length chunks.
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

        # Tokenize for BM25
        def _tokenize(text: str) -> list[str]:
            return re.findall(r"[a-zA-Z0-9\u4e00-\u9fff]+", str(text or "").lower())

        corpus_tokens = [_tokenize(t) for t in chunk_texts]
        query_tokens = _tokenize(clean_query)
        if not query_tokens:
            return []

        bm25 = BM25Okapi(corpus_tokens, k1=1.5, b=0.75)
        scores = bm25.get_scores(query_tokens)

        ranked_idx = np.argsort(scores)[::-1][: max(1, top_k)]
        results: List[RetrievedChunk] = []
        for idx in ranked_idx:
            score = float(scores[idx])
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
