"""Lazy embedding initialization for course RAG."""
from __future__ import annotations

import threading
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from langchain_huggingface import HuggingFaceEmbeddings


class CourseRagEmbeddingProvider:
    """Thread-safe lazy loader for the shared embedding model."""

    def __init__(self, embedding_model_name: str):
        self.embedding_model_name = embedding_model_name
        self._embeddings: Any | None = None
        self._embeddings_lock = threading.Lock()

    @property
    def embeddings(self) -> "HuggingFaceEmbeddings":
        if self._embeddings is None:
            with self._embeddings_lock:
                if self._embeddings is None:
                    from langchain_huggingface import HuggingFaceEmbeddings
                    import torch

                    if torch.cuda.is_available():
                        device = "cuda"
                    elif torch.backends.mps.is_available():
                        device = "mps"
                    else:
                        device = "cpu"

                    self._embeddings = HuggingFaceEmbeddings(
                        model_name=self.embedding_model_name,
                        model_kwargs={"device": device},
                        encode_kwargs={"normalize_embeddings": True},
                    )
        return self._embeddings
