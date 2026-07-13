from __future__ import annotations

import logging
import subprocess

from services.liteparse_service import _command_str, _snippet
from utils.runtime_limits import BoundedTextBuffer

from backend.presenton_runtime.services.export_task import (
    EXPORT_RUNTIME_SHARP_VERSION,
    ExtractSchemaDocument,
    ExtractSchemaSlide,
    ExportTaskServiceCore,
    HtmlToImageTaskResult,
    HtmlToImagesTaskResult,
    PptxToHtmlDocument,
    PresentationExportTaskResult,
    sys_arch,
    sys_platform,
)
from backend.presenton_runtime.services.export_task.output_store import (
    create_task_paths,
    ensure_output_readable,
    is_within_directory,
    persist_export_output,
    persist_temp_export_response,
    resolve_output_path,
)
from backend.presenton_runtime.services.export_task.runtime_dependencies import (
    build_runtime_dependency_env,
    install_runtime_native_dependencies,
    runtime_dependency_missing_detail,
    runtime_missing_detail,
    sync_runtime,
)
from backend.presenton_runtime.services.export_task.subprocess_runner import (
    run_bounded_child_blocking,
    windows_hidden_subprocess_kwargs,
)

LOGGER = logging.getLogger(__name__)


class ExportTaskService(ExportTaskServiceCore):
    def __init__(self, timeout_seconds: int = 300):
        super().__init__(timeout_seconds=timeout_seconds, service_file=__file__)

    def _snippet(self, text: str) -> str:
        return _snippet(text)

    def _runtime_missing_detail(self) -> str | None:
        return runtime_missing_detail(self)

    def _build_runtime_dependency_env(self) -> dict[str, str]:
        return build_runtime_dependency_env(self)

    def _runtime_dependency_missing_detail(self) -> str | None:
        return runtime_dependency_missing_detail(
            self,
            subprocess_module=subprocess,
            snippet=_snippet,
            hidden_subprocess_kwargs=lambda: windows_hidden_subprocess_kwargs(subprocess),
        )

    def _install_runtime_native_dependencies(self) -> str | None:
        return install_runtime_native_dependencies(
            self,
            subprocess_module=subprocess,
            command_str=_command_str,
            snippet=_snippet,
            hidden_subprocess_kwargs=lambda: windows_hidden_subprocess_kwargs(subprocess),
            logger=LOGGER,
        )

    def _sync_runtime(self) -> str | None:
        return sync_runtime(
            self,
            subprocess_module=subprocess,
            snippet=_snippet,
            hidden_subprocess_kwargs=lambda: windows_hidden_subprocess_kwargs(subprocess),
            logger=LOGGER,
        )

    @staticmethod
    def _resolve_output_path(response_data: dict) -> str:
        return resolve_output_path(response_data)

    @staticmethod
    def _ensure_output_readable(output_path: str) -> None:
        ensure_output_readable(output_path)

    @staticmethod
    def _is_within_directory(file_path: str, directory: str) -> bool:
        return is_within_directory(file_path, directory)

    @staticmethod
    def _persist_export_output(output_path: str) -> str:
        return persist_export_output(output_path)

    @classmethod
    def _persist_temp_export_response(cls, response_data: dict, temp_dir: str) -> dict:
        return persist_temp_export_response(response_data, temp_dir)

    @staticmethod
    def _create_task_paths() -> tuple[str, str, str]:
        return create_task_paths()

    def _run_bounded_child_blocking(self, command: list[str], *, cwd: str, env: dict[str, str], timeout: int):
        return run_bounded_child_blocking(
            command,
            cwd=cwd,
            env=env,
            timeout=timeout,
            subprocess_module=subprocess,
            bounded_text_buffer_cls=BoundedTextBuffer,
            command_str=_command_str,
            logger=LOGGER,
        )

    async def _render_htmls_to_images(self, htmls: list[str], width: int, height: int) -> HtmlToImagesTaskResult:
        try:
            response_data = await self._run_task(
                {"type": "html-to-images", "htmls": htmls, "width": width, "height": height},
                "HTML-to-images export task did not produce a response file",
            )
        except Exception as exc:
            from fastapi import HTTPException

            if not isinstance(exc, HTTPException) or "Invalid task type" not in str(exc.detail):
                raise
            LOGGER.warning("[export_runtime] html-to-images is unavailable; falling back to one task per HTML document")
            results = [await self.render_html_to_image(html, width, height) for html in htmls]
            return HtmlToImagesTaskResult(paths=[result.path for result in results])

        raw_paths = response_data.get("file_paths")
        if not isinstance(raw_paths, list) or len(raw_paths) != len(htmls):
            from fastapi import HTTPException

            raise HTTPException(status_code=500, detail="HTML-to-images export task produced invalid output")
        output_paths = [self._resolve_output_path({"file_path": raw_path}) for raw_path in raw_paths]
        for output_path in output_paths:
            self._ensure_output_readable(output_path)
        return HtmlToImagesTaskResult(paths=output_paths)


EXPORT_TASK_SERVICE = ExportTaskService()

__all__ = [
    "EXPORT_RUNTIME_SHARP_VERSION",
    "EXPORT_TASK_SERVICE",
    "ExportTaskService",
    "ExtractSchemaDocument",
    "ExtractSchemaSlide",
    "HtmlToImageTaskResult",
    "HtmlToImagesTaskResult",
    "PptxToHtmlDocument",
    "PresentationExportTaskResult",
    "sys_arch",
    "sys_platform",
]
