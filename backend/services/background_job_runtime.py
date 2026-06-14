from __future__ import annotations

import asyncio
import logging
from collections.abc import Coroutine
from typing import Any

logger = logging.getLogger(__name__)


def spawn_background_coro(coro: Coroutine[Any, Any, Any], *, label: str) -> asyncio.Task:
    task = asyncio.get_running_loop().create_task(coro)
    task.add_done_callback(lambda finished: _log_background_failure(finished, label=label))
    return task


def _log_background_failure(task: asyncio.Task, *, label: str) -> None:
    try:
        task.result()
    except asyncio.CancelledError:
        logger.info("Background task cancelled: %s", label)
    except Exception:
        logger.exception("Background task failed: %s", label)
