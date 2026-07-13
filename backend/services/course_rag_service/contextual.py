"""Contextual Retrieval — prepend LLM-generated context summaries to chunks.

Implements Anthropic's Contextual Retrieval technique (Sep 2024):
  https://www.anthropic.com/news/contextual-retrieval

For each chunk, a lightweight LLM call generates a 50-100 token context that
situates the chunk within the parent document. This context is prepended to
the chunk text before embedding and BM25 indexing.

Measured effect (Anthropic benchmark):
  - Contextual Embeddings alone:        -35 % retrieval failure rate
  - Contextual Embeddings + BM25:       -49 % retrieval failure rate
  - + Neural Reranker on top:           -67 % retrieval failure rate
"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List

import httpx

from backend.config import Config

logger = logging.getLogger(__name__)

_CONTEXT_PROMPT = """\
<document>
{doc_excerpt}
</document>
Here is a chunk we want to situate within the document:
<chunk>
{chunk}
</chunk>
Please give a short succinct context (1-2 sentences, under 80 words) to \
situate this chunk within the overall document for the purposes of improving \
search retrieval. Answer only with the context and nothing else."""


def _sync_ollama_generate(prompt: str, max_tokens: int = 120) -> str:
    """Single synchronous Ollama chat call. Returns "" on any failure."""
    model = (Config.RAG_CONTEXTUAL_RETRIEVAL_MODEL or "").strip() or Config.OLLAMA_MODEL
    url = f"{Config.OLLAMA_BASE_URL}/api/chat"
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "options": {
            "num_predict": max_tokens,
            "temperature": 0.1,
            "top_p": 0.9,
        },
    }
    try:
        with httpx.Client(timeout=30) as client:
            resp = client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
        return str((data.get("message") or {}).get("content", "")).strip()
    except Exception as exc:
        logger.debug("Contextual retrieval LLM call failed: %s", exc)
        return ""


def add_chunk_context(
    chunks: List[Dict[str, Any]],
    document_text: str,
    workers: int = 6,
) -> List[Dict[str, Any]]:
    """Prepend LLM-generated situational context to each chunk's text.

    Uses a thread pool to call Ollama in parallel (one call per chunk).
    Falls back to the original chunk text silently on any error so indexing
    is never blocked by LLM availability.

    Args:
        chunks: List of chunk dicts with at least a ``"text"`` key.
        document_text: The full source document (truncated to 8 k for context).
        workers: Number of parallel Ollama calls.

    Returns:
        New list of chunk dicts with ``"text"`` prepended with context.
    """
    if not chunks:
        return chunks

    doc_excerpt = document_text[:8000].strip()

    def _contextualize_one(idx: int, chunk: Dict[str, Any]) -> tuple[int, Dict[str, Any]]:
        original_text = chunk.get("text", "")
        if not original_text.strip():
            return idx, chunk
        prompt = _CONTEXT_PROMPT.format(
            doc_excerpt=doc_excerpt,
            chunk=original_text[:600],
        )
        context = _sync_ollama_generate(prompt)
        if context:
            updated = dict(chunk)
            updated["text"] = f"{context}\n\n{original_text}"
            return idx, updated
        return idx, chunk

    result: List[Dict[str, Any]] = list(chunks)
    with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="ctx-retr") as pool:
        futures = {
            pool.submit(_contextualize_one, i, c): i
            for i, c in enumerate(chunks)
        }
        for fut in as_completed(futures):
            try:
                idx, updated_chunk = fut.result(timeout=45)
                result[idx] = updated_chunk
            except Exception as exc:
                logger.warning("Chunk contextualization failed at index %s: %s", futures[fut], exc)

    return result
