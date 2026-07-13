"""Tokenization and text normalization helpers for course RAG retrieval."""
from __future__ import annotations

import hashlib
import re


def doc_hash(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def _expand_alphanum(token: str) -> list[str]:
    parts = [token]
    expanded = re.sub(r"([a-z])(\d)", r"\1 \2", token)
    expanded = re.sub(r"(\d)([a-z])", r"\1 \2", expanded)
    if expanded != token:
        parts.extend(p for p in expanded.split() if p)
    return parts


def normalize_query_for_retrieval(query: str) -> str:
    q = str(query or "").strip()
    q = re.sub(r"([a-zA-Z])(\d)", r"\1 \2", q)
    q = re.sub(r"(\d)([a-zA-Z])", r"\1 \2", q)
    return q


def tokenize_for_rerank(text: str) -> set[str]:
    raw_tokens = re.findall(r"[a-zA-Z0-9_\u4e00-\u9fff]+", str(text or "").lower())
    result: set[str] = set()
    for token in raw_tokens:
        for part in _expand_alphanum(token):
            if len(part) >= 2 or part.isdigit():
                result.add(part)
    return result


def normalize_for_dedup(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "").strip().lower())[:180]


def split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?;。！？；])\s+", str(text or "").strip())
    return [part for part in parts if part]


def is_claim_like(sentence: str) -> bool:
    value = str(sentence or "").strip()
    if len(value) < 18:
        return False
    if value.endswith("?") or value.endswith("？"):
        return False
    return True


def tokenize_text(text: str) -> set[str]:
    tokens = re.findall(r"[a-zA-Z0-9_\u4e00-\u9fff]+", str(text or "").lower())
    return {token for token in tokens if len(token) >= 2 and token not in _STOP_TOKENS}


_STOP_TOKENS = {
    "a",
    "an",
    "and",
    "all",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "has",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "their",
    "this",
    "to",
    "under",
    "with",
}


__all__ = [
    "doc_hash",
    "is_claim_like",
    "normalize_for_dedup",
    "normalize_query_for_retrieval",
    "split_sentences",
    "tokenize_for_rerank",
    "tokenize_text",
]
