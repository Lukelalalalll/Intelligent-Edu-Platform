from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor

_retrieval_pool: ThreadPoolExecutor | None = None
_retrieval_pool_lock = threading.Lock()


def get_retrieval_pool() -> ThreadPoolExecutor:
    global _retrieval_pool
    if _retrieval_pool is not None:
        return _retrieval_pool
    with _retrieval_pool_lock:
        if _retrieval_pool is None:
            _retrieval_pool = ThreadPoolExecutor(max_workers=8, thread_name_prefix="rag-retr")
        return _retrieval_pool


def shutdown_retrieval_pool() -> None:
    global _retrieval_pool
    if _retrieval_pool is not None:
        _retrieval_pool.shutdown(wait=True, cancel_futures=True)
        _retrieval_pool = None
