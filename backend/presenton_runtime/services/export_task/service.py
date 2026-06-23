from __future__ import annotations

import json
import logging
import os
import shutil
from typing import Literal

from fastapi import HTTPException
from pydantic import ValidationError

from utils.runtime_limits import log_memory

from .models import (
    ExtractSchemaDocument,
    HtmlToImageTaskResult,
    HtmlToImagesTaskResult,
    PptxToHtmlDocument,
    PresentationExportTaskResult,
)
from .output_store import create_task_paths
from .runtime_dependencies import build_node_env, ensure_runtime_ready
from .runtime_paths import refresh_runtime_paths
from .subprocess_runner import run_bounded_child

LOGGER = logging.getLogger(__name__)


class ExportTaskServiceCore:
    def __init__(self, timeout_seconds: int = 300, *, service_file: str):
        self.timeout_seconds = timeout_seconds
        self.service_file = service_file
        self.node_binary = os.getenv("LITEPARSE_NODE_BINARY", "node")
        self.export_dir = ""
        self.entrypoint_path = ""
        self.converter_path = ""
        self._refresh_runtime_paths()

    def _refresh_runtime_paths(self) -> None:
        refresh_runtime_paths(self)

    def _build_node_env(self, *, asset_base_url: str | None = None):
        return build_node_env(self, asset_base_url=asset_base_url)

    def _ensure_runtime_ready(self) -> None:
        ensure_runtime_ready(self)

    @staticmethod
    def _create_task_paths() -> tuple[str, str, str]:
        return create_task_paths()

    async def _run_task(
        self,
        task_payload: dict,
        response_error_detail: str,
        *,
        asset_base_url: str | None = None,
    ) -> dict:
        return await self._run_task_locked(task_payload, response_error_detail, asset_base_url=asset_base_url)

    async def _run_task_locked(
        self,
        task_payload: dict,
        response_error_detail: str,
        *,
        asset_base_url: str | None = None,
    ) -> dict:
        self._ensure_runtime_ready()
        temp_dir, task_path, response_path = self._create_task_paths()
        try:
            with open(task_path, "w", encoding="utf-8") as task_file:
                json.dump(task_payload, task_file)

            log_memory(LOGGER, "export_task.spawn", task_type=task_payload.get("type"))
            result = await self._run_bounded_child(
                [self.node_binary, self.entrypoint_path, task_path],
                cwd=self.export_dir,
                timeout=self.timeout_seconds,
                env=dict(self._build_node_env(asset_base_url=asset_base_url)),
            )
            log_memory(
                LOGGER,
                "export_task.exit",
                task_type=task_payload.get("type"),
                returncode=result["returncode"],
            )
            if result["returncode"] != 0:
                raise HTTPException(status_code=500, detail=self._format_task_failure(result))
            if not os.path.isfile(response_path):
                raise HTTPException(status_code=500, detail=response_error_detail)

            with open(response_path, "r", encoding="utf-8") as response_file:
                response_data = json.load(response_file)
            if task_payload.get("type") == "export":
                return self._persist_temp_export_response(response_data, temp_dir)
            return response_data
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=500, detail="Export task produced invalid JSON output") from exc
        except OSError as exc:
            raise HTTPException(status_code=500, detail=f"Failed to run export task: {exc}") from exc
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    def _format_task_failure(self, result: dict[str, str | int]) -> str:
        return (
            "Export task failed. "
            f"returncode={result['returncode']} "
            f"stderr={self._snippet(result['stderr'])} stdout={self._snippet(result['stdout'])}"
        )

    async def _run_bounded_child(self, command: list[str], *, cwd: str, env: dict[str, str], timeout: int):
        return await run_bounded_child(self, command, cwd=cwd, env=env, timeout=timeout)

    async def export_from_url(
        self,
        url: str,
        title: str,
        export_as: Literal["pdf", "pptx"],
        fastapi_url: str | None = None,
        cookie_header: str | None = None,
    ) -> PresentationExportTaskResult:
        log_url = url.split("#", 1)[0] if "#" in url else url
        LOGGER.info("[export_runtime] export_from_url url=%s format=%s cookie_header=%s", log_url, export_as, "set" if cookie_header else "empty")
        response_data = await self._run_task(
            {
                "type": "export",
                "url": url,
                "format": export_as,
                "title": title,
                "fastapiUrl": fastapi_url or None,
                "cookieHeader": cookie_header or None,
            },
            "Export task did not produce a response file",
            asset_base_url=fastapi_url,
        )
        output_path = self._persist_export_output(self._resolve_output_path(response_data))
        self._ensure_output_readable(output_path)
        return PresentationExportTaskResult(path=output_path)

    async def convert_pptx_to_html(self, pptx_path: str, get_fonts: bool = False) -> PptxToHtmlDocument:
        if not os.path.isfile(pptx_path):
            raise HTTPException(status_code=400, detail=f"PPTX not found: {pptx_path}")
        try:
            response_data = await self._run_task(
                {"type": "pptx-to-html", "pptx_path": pptx_path, "get_fonts": get_fonts},
                "PPTX-to-HTML export task did not produce a response file",
            )
            output_path = self._resolve_output_path(response_data)
            with open(output_path, "r", encoding="utf-8") as output_file:
                output_data = json.load(output_file)
            return PptxToHtmlDocument(**output_data)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=500, detail="PPTX-to-HTML export produced invalid JSON output") from exc

    async def render_html_to_image(self, html: str, width: int, height: int) -> HtmlToImageTaskResult:
        if width <= 0 or height <= 0:
            raise HTTPException(status_code=400, detail="HTML-to-image dimensions must be positive")
        response_data = await self._run_task(
            {"type": "html-to-image", "html": html, "width": width, "height": height},
            "HTML-to-image export task did not produce a response file",
        )
        output_path = self._resolve_output_path(response_data)
        self._ensure_output_readable(output_path)
        return HtmlToImageTaskResult(path=output_path)

    async def render_htmls_to_images(self, htmls: list[str], width: int, height: int) -> HtmlToImagesTaskResult:
        if not htmls:
            raise HTTPException(status_code=400, detail="At least one HTML document is required")
        if width <= 0 or height <= 0:
            raise HTTPException(status_code=400, detail="HTML-to-image dimensions must be positive")
        return await self._render_htmls_to_images(htmls, width, height)

    async def extract_schema(self, url: str) -> ExtractSchemaDocument:
        LOGGER.info("[export_runtime] extract_schema spawn url=%s entrypoint=%s export_dir=%s", url, self.entrypoint_path, self.export_dir)
        try:
            response_data = await self._run_task({"type": "extract-schema", "url": url}, "Extract-schema task did not produce a response file")
            slides = response_data.get("slides") if isinstance(response_data, dict) else None
            LOGGER.info(
                "[export_runtime] extract_schema node finished url=%s response_name=%r ordered=%s icon_weight=%s slides=%s",
                url,
                response_data.get("name") if isinstance(response_data, dict) else None,
                response_data.get("ordered") if isinstance(response_data, dict) else None,
                response_data.get("icon_weight") if isinstance(response_data, dict) else None,
                len(slides) if isinstance(slides, list) else "?",
            )
            return ExtractSchemaDocument(**response_data)
        except ValidationError as exc:
            LOGGER.exception("[export_runtime] extract_schema pydantic validation failed url=%s", url)
            raise HTTPException(status_code=500, detail="Extract-schema task produced invalid output") from exc
