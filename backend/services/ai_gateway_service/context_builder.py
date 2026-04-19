"""Serialize context dict into a bounded text payload for Coze requests."""
import json
from typing import Any, Dict, Optional


def serialize_context(context: Optional[Dict[str, Any]] = None) -> str:
    """Convert context to bounded text payload to keep Coze requests stable."""
    if not context:
        return ""

    compact = dict(context)

    # Keep only recent chat turns and trim each turn length.
    chat_history = compact.get("chat_history") or []
    if isinstance(chat_history, list):
        compact["chat_history"] = [
            {
                "role": str(item.get("role", ""))[:16],
                "content": str(item.get("content", ""))[:400],
            }
            for item in chat_history[-6:]
            if isinstance(item, dict)
        ]

    # Trim RAG chunk text size to reduce latency and provider truncation risk.
    rag = compact.get("rag") or {}
    if isinstance(rag, dict):
        chunks = rag.get("retrieved_chunks") or []
        trimmed_chunks = []
        for chunk in chunks[:3]:
            if not isinstance(chunk, dict):
                continue
            trimmed_chunks.append(
                {
                    "chunk_id": chunk.get("chunk_id"),
                    "score": chunk.get("score"),
                    "text": str(chunk.get("text", ""))[:600],
                }
            )
        compact["rag"] = {
            "retrieved_count": len(trimmed_chunks),
            "retrieved_chunks": trimmed_chunks,
        }

    context_text = json.dumps(compact, ensure_ascii=False)
    return context_text[:15000]
