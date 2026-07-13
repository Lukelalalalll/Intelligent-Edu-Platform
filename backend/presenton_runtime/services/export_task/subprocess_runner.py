from __future__ import annotations

import asyncio
import os
import threading

from fastapi import HTTPException


def windows_hidden_subprocess_kwargs(subprocess_module) -> dict[str, object]:
    if os.name != "nt":
        return {}
    return {"creationflags": getattr(subprocess_module, "CREATE_NO_WINDOW", 0)}


async def run_bounded_child(
    service,
    command: list[str],
    *,
    cwd: str,
    env: dict[str, str],
    timeout: int,
) -> dict[str, str | int]:
    return await asyncio.to_thread(
        service._run_bounded_child_blocking,
        command,
        cwd=cwd,
        env=env,
        timeout=timeout,
    )


def run_bounded_child_blocking(
    command: list[str],
    *,
    cwd: str,
    env: dict[str, str],
    timeout: int,
    subprocess_module,
    bounded_text_buffer_cls,
    command_str,
    logger,
) -> dict[str, str | int]:
    stdout_tail = bounded_text_buffer_cls()
    stderr_tail = bounded_text_buffer_cls()
    process = subprocess_module.Popen(
        command,
        cwd=cwd,
        stdout=subprocess_module.PIPE,
        stderr=subprocess_module.PIPE,
        env=env,
        **windows_hidden_subprocess_kwargs(subprocess_module),
    )
    logger.info("[export_runtime] child started pid=%s command=%s", process.pid, command_str(command))

    def drain(stream, tail, label: str) -> None:
        if stream is None:
            return
        try:
            while True:
                chunk = stream.read(65536)
                if not chunk:
                    break
                tail.append(chunk)
                logger.debug("[export_runtime] %s chunk=%s bytes", label, len(chunk))
        finally:
            stream.close()

    stdout_thread = threading.Thread(target=drain, args=(process.stdout, stdout_tail, "stdout"), daemon=True)
    stderr_thread = threading.Thread(target=drain, args=(process.stderr, stderr_tail, "stderr"), daemon=True)
    stdout_thread.start()
    stderr_thread.start()
    try:
        process.wait(timeout=timeout)
    except subprocess_module.TimeoutExpired as exc:
        process.kill()
        process.wait()
        stdout_thread.join()
        stderr_thread.join()
        raise HTTPException(status_code=500, detail=f"Export task timed out after {timeout} seconds") from exc
    stdout_thread.join()
    stderr_thread.join()
    logger.info("[export_runtime] child exited pid=%s returncode=%s", process.pid, process.returncode)
    return {
        "returncode": process.returncode if process.returncode is not None else -1,
        "stdout": stdout_tail.get(),
        "stderr": stderr_tail.get(),
    }
