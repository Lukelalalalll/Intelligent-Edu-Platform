import asyncio
import json
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import uuid
from typing import Literal, Mapping

from fastapi import HTTPException
from pydantic import BaseModel, ValidationError, model_validator

from services.liteparse_service import _command_str, _snippet
from utils.asset_directory_utils import (
    get_exports_directory,
    resolve_app_path_to_filesystem,
)
from utils.get_env import (
    get_app_data_directory_env,
    get_fastapi_public_base_url,
    get_temp_directory_env,
)
from utils.icon_weights import DEFAULT_ICON_WEIGHT, extract_icon_weight_from_settings
from utils.runtime_limits import (
    BoundedTextBuffer,
    log_memory,
)

LOGGER = logging.getLogger(__name__)

EXPORT_DIRECTORY_MODE = 0o755
EXPORT_FILE_MODE = 0o644
EXPORT_RUNTIME_SHARP_VERSION = (
    os.getenv("EXPORT_RUNTIME_SHARP_VERSION", "^0.34.5").strip() or "^0.34.5"
)


def _windows_hidden_subprocess_kwargs() -> dict[str, object]:
    if os.name != "nt":
        return {}
    return {"creationflags": getattr(subprocess, "CREATE_NO_WINDOW", 0)}


class PptxToHtmlDocument(BaseModel):
    slides: list[str]
    font_css: str = ""
    width: float
    height: float
    images_dir: str
    fonts_dir: str


class PresentationExportTaskResult(BaseModel):
    path: str


class HtmlToImageTaskResult(BaseModel):
    path: str


class HtmlToImagesTaskResult(BaseModel):
    paths: list[str]


class ExtractSchemaSlide(BaseModel):
    id: str
    name: str | None = None
    description: str | None = None
    json_schema: dict


class ExtractSchemaDocument(BaseModel):
    name: str
    ordered: bool = False
    icon_weight: str = DEFAULT_ICON_WEIGHT
    slides: list[ExtractSchemaSlide]

    @model_validator(mode="before")
    @classmethod
    def normalize_icon_weight(cls, data):
        if isinstance(data, dict):
            normalized = dict(data)
            normalized["icon_weight"] = extract_icon_weight_from_settings(normalized)
            return normalized
        return data


class ExportTaskService:
    def __init__(self, timeout_seconds: int = 300):
        self.timeout_seconds = timeout_seconds
        self.node_binary = os.getenv("LITEPARSE_NODE_BINARY", "node")
        self.export_dir = ""
        self.entrypoint_path = ""
        self.converter_path = ""
        self._refresh_runtime_paths()

    def _refresh_runtime_paths(self) -> None:
        self.export_dir = self._resolve_export_dir()
        self.entrypoint_path = self._resolve_entrypoint_path(self.export_dir)
        self.converter_path = self._resolve_converter_path(self.export_dir)

    @staticmethod
    def _resolve_export_dir() -> str:
        configured = (os.getenv("EXPORT_RUNTIME_DIR") or "").strip()
        if configured:
            return configured

        package_root = (os.getenv("EXPORT_PACKAGE_ROOT") or "").strip()
        if package_root:
            return package_root

        cwd = os.path.abspath(".")
        service_dir = os.path.dirname(__file__)
        candidates = [
            os.path.abspath(os.path.join(cwd, "..", "..", "presentation-export")),
            os.path.abspath(os.path.join(cwd, "..", "presentation-export")),
            os.path.abspath(os.path.join(service_dir, "..", "..", "..", "presentation-export")),
            os.path.abspath(os.path.join(service_dir, "..", "..", "..", "..", "presentation-export")),
        ]

        for candidate in candidates:
            if os.path.isfile(os.path.join(candidate, "index.cjs")) or os.path.isfile(
                os.path.join(candidate, "index.js")
            ):
                return candidate

        return candidates[0]

    @staticmethod
    def _resolve_entrypoint_path(export_dir: str) -> str:
        index_cjs = os.path.join(export_dir, "index.cjs")
        if os.path.isfile(index_cjs):
            return index_cjs

        index_js = os.path.join(export_dir, "index.js")
        if os.path.isfile(index_js):
            # Packaged app resource directories can be read-only (e.g. /opt installs).
            # Try to create index.cjs for compatibility, but fall back to index.js
            # when writing is not permitted.
            try:
                shutil.copyfile(index_js, index_cjs)
                return index_cjs
            except OSError:
                return index_js

        return index_cjs

    @staticmethod
    def _resolve_converter_path(export_dir: str) -> str:
        py_dir = os.path.join(export_dir, "py")
        extension = ".exe" if os.name == "nt" else ""
        platform_aliases = {
            "linux": ["linux"],
            "darwin": ["darwin", "macos", "mac"],
            "win32": ["win32", "windows", "win"],
        }
        arch_aliases = {
            "x64": ["x64", "amd64"],
            "arm64": ["arm64", "aarch64"],
        }
        platforms = platform_aliases.get(sys_platform(), [sys_platform()])
        archs = arch_aliases.get(sys_arch(), [sys_arch()])
        candidates: list[str] = []
        for candidate_dir in (py_dir, export_dir):
            for platform_name in platforms:
                for arch_name in archs:
                    candidates.append(
                        os.path.join(
                            candidate_dir, f"convert-{platform_name}-{arch_name}{extension}"
                        )
                    )
                candidates.append(
                    os.path.join(candidate_dir, f"convert-{platform_name}{extension}")
                )
            if os.name == "nt":
                candidates.append(os.path.join(candidate_dir, "convert.exe"))
            candidates.extend(
                [
                    os.path.join(candidate_dir, f"convert{extension}"),
                    os.path.join(candidate_dir, "convert"),
                ]
            )
        candidates = list(dict.fromkeys(candidates))
        for candidate in candidates:
            if candidate and os.path.isfile(candidate):
                return candidate
        return candidates[0]

    def _build_node_env(self, *, asset_base_url: str | None = None) -> Mapping[str, str]:
        env = os.environ.copy()

        app_data_directory = get_app_data_directory_env()
        if not app_data_directory:
            raise HTTPException(
                status_code=500,
                detail="APP_DATA_DIRECTORY must be set for PPTX-to-HTML export",
            )
        env["APP_DATA_DIRECTORY"] = app_data_directory

        temp_directory = get_temp_directory_env() or os.path.join(
            tempfile.gettempdir(), "presenton"
        )
        os.makedirs(temp_directory, exist_ok=True)
        env["TEMP_DIRECTORY"] = temp_directory

        puppeteer_temp_directory = (
            env.get("PUPPETEER_TMP_DIR") or os.path.join(temp_directory, "puppeteer")
        )
        os.makedirs(puppeteer_temp_directory, exist_ok=True)
        env["PUPPETEER_TMP_DIR"] = puppeteer_temp_directory

        puppeteer_cache_directory = env.get("PUPPETEER_CACHE_DIR") or os.path.join(
            temp_directory, "puppeteer-cache"
        )
        os.makedirs(puppeteer_cache_directory, exist_ok=True)
        env["PUPPETEER_CACHE_DIR"] = puppeteer_cache_directory

        fastapi_base = (asset_base_url or get_fastapi_public_base_url() or "").strip()
        if not fastapi_base:
            raise HTTPException(
                status_code=500,
                detail="A public Presenton asset base URL is required for PPTX-to-HTML export",
            )
        env["ASSETS_BASE_URL"] = f"{fastapi_base.rstrip('/')}/app_data"
        env["BUILT_PYTHON_MODULE_PATH"] = self.converter_path

        node_path_entries = self._resolve_export_node_path_entries(env)
        if node_path_entries:
            env["NODE_PATH"] = os.pathsep.join(node_path_entries)

        puppeteer_executable_path = self._resolve_puppeteer_executable_path(env)
        if puppeteer_executable_path:
            env["PUPPETEER_EXECUTABLE_PATH"] = puppeteer_executable_path

        return env

    def _resolve_export_node_path_entries(
        self, env: Mapping[str, str] | None = None
    ) -> list[str]:
        env = env or os.environ
        configured_paths = [
            entry.strip()
            for entry in (env.get("NODE_PATH") or "").split(os.pathsep)
            if entry.strip()
        ]
        runtime_paths = [
            entry.strip()
            for entry in (os.getenv("EXPORT_RUNTIME_NODE_PATH") or "").split(os.pathsep)
            if entry.strip()
        ]

        export_dir = os.path.abspath(self.export_dir or "")
        export_root = os.path.dirname(export_dir) if export_dir else ""
        cwd = os.path.abspath(".")
        candidates = [
            *configured_paths,
            *runtime_paths,
            os.path.join(export_dir, "node_modules") if export_dir else "",
            os.path.join(export_root, "node_modules") if export_root else "",
            os.path.join(export_root, "frontend", "node_modules") if export_root else "",
            os.path.join(cwd, "node_modules"),
            os.path.join(cwd, "frontend", "node_modules"),
            os.path.join(cwd, "..", "frontend", "node_modules"),
        ]

        resolved_paths: list[str] = []
        seen: set[str] = set()
        for candidate in candidates:
            if not candidate:
                continue
            resolved = os.path.abspath(candidate)
            key = resolved.lower() if os.name == "nt" else resolved
            if key in seen or not os.path.isdir(resolved):
                continue
            seen.add(key)
            resolved_paths.append(resolved)
        return resolved_paths

    def _resolve_puppeteer_executable_path(
        self, env: Mapping[str, str] | None = None
    ) -> str | None:
        env = env or os.environ
        configured = (env.get("PUPPETEER_EXECUTABLE_PATH") or "").strip()
        if configured and os.path.isfile(configured):
            return configured

        for candidate in self._chrome_executable_candidates():
            if os.path.isfile(candidate):
                return candidate
        return None

    @staticmethod
    def _chrome_executable_candidates() -> list[str]:
        candidates: list[str] = []
        if os.name == "nt":
            local_app_data = (os.environ.get("LOCALAPPDATA") or "").strip()
            for candidate in (
                r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                r"D:\Program Files\Google\Chrome\Application\chrome.exe",
                r"D:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                os.path.join(local_app_data, "Google", "Chrome", "Application", "chrome.exe")
                if local_app_data
                else "",
            ):
                if candidate:
                    candidates.append(candidate)
            return candidates

        if sys.platform == "darwin":
            return [
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
            ]

        return [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
        ]

    @staticmethod
    def _resolve_export_sync_script(export_dir: str) -> str | None:
        configured = (os.getenv("EXPORT_RUNTIME_SYNC_SCRIPT") or "").strip()
        if configured:
            return configured

        cwd = os.path.abspath(".")
        service_dir = os.path.dirname(__file__)
        candidates = [
            os.path.join(os.path.dirname(export_dir), "scripts", "sync-presentation-export.cjs"),
            os.path.join(cwd, "scripts", "sync-presentation-export.cjs"),
            os.path.join(cwd, "..", "scripts", "sync-presentation-export.cjs"),
            os.path.join(service_dir, "..", "..", "..", "scripts", "sync-presentation-export.cjs"),
            os.path.join(
                service_dir, "..", "..", "..", "..", "scripts", "sync-presentation-export.cjs"
            ),
        ]
        for candidate in candidates:
            resolved = os.path.abspath(candidate)
            if os.path.isfile(resolved):
                return resolved
        return None

    def _runtime_missing_detail(self) -> str | None:
        if not os.path.isfile(self.entrypoint_path):
            return f"Export runtime not found at {self.entrypoint_path}"
        if not os.path.isfile(self.converter_path):
            return f"Export converter binary not found at {self.converter_path}"
        return None

    @staticmethod
    def _npm_binary() -> str:
        return "npm.cmd" if os.name == "nt" else "npm"

    def _build_runtime_dependency_env(self) -> dict[str, str]:
        env = os.environ.copy()
        node_path_entries = self._resolve_export_node_path_entries(env)
        if node_path_entries:
            env["NODE_PATH"] = os.pathsep.join(node_path_entries)
        return env

    def _runtime_dependency_missing_detail(self) -> str | None:
        if not os.path.isfile(self.entrypoint_path):
            return None

        env = self._build_runtime_dependency_env()
        command = [self.node_binary, "-e", "require('sharp')"]
        try:
            result = subprocess.run(
                command,
                cwd=self.export_dir,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=False,
                **_windows_hidden_subprocess_kwargs(),
            )
        except OSError as exc:
            return f"Failed to validate export runtime native dependencies: {exc}"

        if result.returncode == 0:
            return None

        return (
            "Export runtime native dependency 'sharp' is unavailable. "
            f"returncode={result.returncode} "
            f"stderr={_snippet(result.stderr)} stdout={_snippet(result.stdout)}"
        )

    def _ensure_runtime_package_manifest(self) -> None:
        package_json_path = os.path.join(self.export_dir, "package.json")
        if os.path.isfile(package_json_path):
            return

        os.makedirs(self.export_dir, exist_ok=True)
        with open(package_json_path, "w", encoding="utf-8") as package_file:
            json.dump(
                {
                    "name": "presentation-export-runtime",
                    "private": True,
                },
                package_file,
                indent=2,
            )
            package_file.write("\n")

    def _install_runtime_native_dependencies(self) -> str | None:
        if (os.getenv("ENSURE_PRESENTATION_EXPORT_RUNTIME") or "").strip().lower() == "false":
            return (
                "Automatic export runtime dependency install is disabled by "
                "ENSURE_PRESENTATION_EXPORT_RUNTIME=false."
            )

        try:
            self._ensure_runtime_package_manifest()
        except OSError as exc:
            return f"Failed to prepare export runtime package manifest: {exc}"

        command = [
            self._npm_binary(),
            "install",
            f"sharp@{EXPORT_RUNTIME_SHARP_VERSION}",
            "--include=optional",
            "--omit=dev",
            "--no-fund",
            "--no-audit",
            "--no-package-lock",
        ]
        LOGGER.info(
            "[export_runtime] installing native dependency via %s",
            _command_str(command),
        )
        try:
            result = subprocess.run(
                command,
                cwd=self.export_dir,
                env=self._build_runtime_dependency_env(),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=False,
                **_windows_hidden_subprocess_kwargs(),
            )
        except OSError as exc:
            return f"Failed to start export runtime dependency install: {exc}"

        if result.returncode != 0:
            return (
                "Export runtime dependency install failed. "
                f"returncode={result.returncode} "
                f"stderr={_snippet(result.stderr)} stdout={_snippet(result.stdout)}"
            )

        return None

    def _sync_runtime(self) -> str | None:
        if (os.getenv("ENSURE_PRESENTATION_EXPORT_RUNTIME") or "").strip().lower() == "false":
            return (
                "Automatic export runtime sync is disabled by "
                "ENSURE_PRESENTATION_EXPORT_RUNTIME=false."
            )

        sync_script = self._resolve_export_sync_script(self.export_dir)
        if not sync_script:
            return (
                "Export runtime sync script not found. "
                "Run node scripts/sync-presentation-export.cjs from the repo root."
            )

        repo_root = os.path.dirname(os.path.dirname(sync_script))
        LOGGER.info("[export_runtime] syncing missing runtime via %s", sync_script)
        try:
            result = subprocess.run(
                [self.node_binary, sync_script],
                cwd=repo_root,
                env=os.environ.copy(),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=False,
                **_windows_hidden_subprocess_kwargs(),
            )
        except OSError as exc:
            return f"Failed to start export runtime sync: {exc}"

        if result.returncode != 0:
            return (
                "Export runtime sync failed. "
                f"returncode={result.returncode} "
                f"stderr={_snippet(result.stderr)} stdout={_snippet(result.stdout)}"
            )

        self._refresh_runtime_paths()
        return None

    def _ensure_runtime_ready(self) -> None:
        missing_detail = self._runtime_missing_detail()
        if missing_detail:
            sync_error = self._sync_runtime()
            missing_detail = self._runtime_missing_detail()
            if missing_detail:
                if not sync_error:
                    sync_error = (
                        "Automatic export runtime sync completed but the runtime is still "
                        "unavailable."
                    )
                raise HTTPException(
                    status_code=500,
                    detail=f"{missing_detail}. {sync_error}",
                )

        dependency_detail = self._runtime_dependency_missing_detail()
        if not dependency_detail:
            return

        install_error = self._install_runtime_native_dependencies()
        dependency_detail = self._runtime_dependency_missing_detail()
        if not dependency_detail:
            return

        if not install_error:
            install_error = (
                "Automatic export runtime dependency install completed but the native "
                "dependency is still unavailable."
            )
        raise HTTPException(
            status_code=500,
            detail=f"{dependency_detail}. {install_error}",
        )

    @staticmethod
    def _resolve_output_path(response_data: dict) -> str:
        for path_key in ("path", "file_path"):
            path_value = response_data.get(path_key)
            if isinstance(path_value, str):
                resolved = resolve_app_path_to_filesystem(path_value) or path_value
                if os.path.isfile(resolved):
                    return resolved

        url_value = response_data.get("url")
        if isinstance(url_value, str):
            resolved = resolve_app_path_to_filesystem(url_value)
            if resolved and os.path.isfile(resolved):
                return resolved

        raise HTTPException(
            status_code=500,
            detail="PPTX-to-HTML task completed without a valid output path",
        )

    @staticmethod
    def _ensure_output_readable(output_path: str) -> None:
        try:
            os.chmod(os.path.dirname(output_path), EXPORT_DIRECTORY_MODE)
            os.chmod(output_path, EXPORT_FILE_MODE)
        except OSError as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Export completed but output permissions could not be updated: {exc}",
            ) from exc

    @staticmethod
    def _is_within_directory(file_path: str, directory: str) -> bool:
        try:
            common = os.path.commonpath(
                [os.path.abspath(file_path), os.path.abspath(directory)]
            )
        except ValueError:
            return False
        return os.path.normcase(common) == os.path.normcase(os.path.abspath(directory))

    @staticmethod
    def _persist_export_output(output_path: str) -> str:
        exports_directory = get_exports_directory()
        resolved_output_path = os.path.abspath(output_path)

        if ExportTaskService._is_within_directory(
            resolved_output_path, exports_directory
        ):
            return resolved_output_path

        filename = os.path.basename(resolved_output_path) or "presentation"
        stem, ext = os.path.splitext(filename)
        candidate_path = os.path.join(exports_directory, filename)

        while os.path.exists(candidate_path):
            try:
                if os.path.samefile(candidate_path, resolved_output_path):
                    return os.path.abspath(candidate_path)
            except OSError:
                pass
            candidate_path = os.path.join(
                exports_directory, f"{stem}-{uuid.uuid4().hex[:8]}{ext}"
            )

        try:
            shutil.move(resolved_output_path, candidate_path)
        except OSError as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Export completed but the output file could not be finalized: {exc}",
            ) from exc

        return os.path.abspath(candidate_path)

    @classmethod
    def _persist_temp_export_response(
        cls, response_data: dict, temp_dir: str
    ) -> dict:
        output_path = cls._resolve_output_path(response_data)
        if not cls._is_within_directory(output_path, temp_dir):
            return response_data
        return {"path": cls._persist_export_output(output_path)}

    @staticmethod
    def _create_task_paths() -> tuple[str, str, str]:
        temp_root = get_temp_directory_env() or os.path.join(
            tempfile.gettempdir(), "presenton"
        )
        os.makedirs(temp_root, exist_ok=True)
        temp_dir = tempfile.mkdtemp(prefix="export-task-", dir=temp_root)
        task_path = os.path.join(temp_dir, "export_task.json")
        response_path = os.path.join(temp_dir, "export_task.response.json")
        return temp_dir, task_path, response_path

    async def _run_task(
        self,
        task_payload: dict,
        response_error_detail: str,
        *,
        asset_base_url: str | None = None,
    ) -> dict:
        return await self._run_task_locked(
            task_payload,
            response_error_detail,
            asset_base_url=asset_base_url,
        )

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

            log_memory(
                LOGGER,
                "export_task.spawn",
                task_type=task_payload.get("type"),
            )
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
                LOGGER.error(
                    "[export_runtime] child failed returncode=%s stderr=%s stdout=%s",
                    result["returncode"],
                    _snippet(result["stderr"]),
                    _snippet(result["stdout"]),
                )
                raise HTTPException(
                    status_code=500,
                    detail=(
                        "Export task failed. "
                        f"returncode={result['returncode']} "
                        f"stderr={_snippet(result['stderr'])} stdout={_snippet(result['stdout'])}"
                    ),
                )

            if not os.path.isfile(response_path):
                raise HTTPException(
                    status_code=500,
                    detail=response_error_detail,
                )

            with open(response_path, "r", encoding="utf-8") as response_file:
                response_data = json.load(response_file)

            if task_payload.get("type") == "export":
                return self._persist_temp_export_response(response_data, temp_dir)

            return response_data
        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=500,
                detail="Export task produced invalid JSON output",
            ) from exc
        except OSError as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to run export task: {exc}",
            ) from exc
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    async def _run_bounded_child(
        self,
        command: list[str],
        *,
        cwd: str,
        env: dict[str, str],
        timeout: int,
    ) -> dict[str, str | int]:
        return await asyncio.to_thread(
            self._run_bounded_child_blocking,
            command,
            cwd=cwd,
            env=env,
            timeout=timeout,
        )

    def _run_bounded_child_blocking(
        self,
        command: list[str],
        *,
        cwd: str,
        env: dict[str, str],
        timeout: int,
    ) -> dict[str, str | int]:
        stdout_tail = BoundedTextBuffer()
        stderr_tail = BoundedTextBuffer()
        process = subprocess.Popen(
            command,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            **_windows_hidden_subprocess_kwargs(),
        )

        LOGGER.info(
            "[export_runtime] child started pid=%s command=%s",
            process.pid,
            _command_str(command),
        )

        def drain(
            stream,
            tail: BoundedTextBuffer,
            label: str,
        ) -> None:
            if stream is None:
                return
            try:
                while True:
                    chunk = stream.read(65536)
                    if not chunk:
                        break
                    tail.append(chunk)
                    LOGGER.debug("[export_runtime] %s chunk=%s bytes", label, len(chunk))
            finally:
                stream.close()

        stdout_thread = threading.Thread(
            target=drain,
            args=(process.stdout, stdout_tail, "stdout"),
            daemon=True,
        )
        stderr_thread = threading.Thread(
            target=drain,
            args=(process.stderr, stderr_tail, "stderr"),
            daemon=True,
        )
        stdout_thread.start()
        stderr_thread.start()
        try:
            process.wait(timeout=timeout)
        except subprocess.TimeoutExpired as exc:
            process.kill()
            process.wait()
            stdout_thread.join()
            stderr_thread.join()
            raise HTTPException(
                status_code=500,
                detail=f"Export task timed out after {timeout} seconds",
            ) from exc
        stdout_thread.join()
        stderr_thread.join()

        LOGGER.info(
            "[export_runtime] child exited pid=%s returncode=%s",
            process.pid,
            process.returncode,
        )
        return {
            "returncode": process.returncode if process.returncode is not None else -1,
            "stdout": stdout_tail.get(),
            "stderr": stderr_tail.get(),
        }

    async def export_from_url(
        self,
        url: str,
        title: str,
        export_as: Literal["pdf", "pptx"],
        fastapi_url: str | None = None,
        cookie_header: str | None = None,
    ) -> PresentationExportTaskResult:
        log_url = url.split("#", 1)[0] if "#" in url else url
        LOGGER.info(
            "[export_runtime] export_from_url url=%s format=%s cookie_header=%s",
            log_url,
            export_as,
            "set" if cookie_header else "empty",
        )
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

        output_path = self._persist_export_output(
            self._resolve_output_path(response_data)
        )
        self._ensure_output_readable(output_path)

        return PresentationExportTaskResult(
            path=output_path,
        )

    async def convert_pptx_to_html(
        self, pptx_path: str, get_fonts: bool = False
    ) -> PptxToHtmlDocument:
        if not os.path.isfile(pptx_path):
            raise HTTPException(status_code=400, detail=f"PPTX not found: {pptx_path}")

        try:
            response_data = await self._run_task(
                {
                    "type": "pptx-to-html",
                    "pptx_path": pptx_path,
                    "get_fonts": get_fonts,
                },
                "PPTX-to-HTML export task did not produce a response file",
            )

            output_path = self._resolve_output_path(response_data)
            with open(output_path, "r", encoding="utf-8") as output_file:
                output_data = json.load(output_file)

            return PptxToHtmlDocument(**output_data)
        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=500,
                detail="PPTX-to-HTML export produced invalid JSON output",
            ) from exc

    async def render_html_to_image(
        self,
        html: str,
        width: int,
        height: int,
    ) -> HtmlToImageTaskResult:
        if width <= 0 or height <= 0:
            raise HTTPException(
                status_code=400,
                detail="HTML-to-image dimensions must be positive",
            )

        response_data = await self._run_task(
            {
                "type": "html-to-image",
                "html": html,
                "width": width,
                "height": height,
            },
            "HTML-to-image export task did not produce a response file",
        )

        output_path = self._resolve_output_path(response_data)
        self._ensure_output_readable(output_path)

        return HtmlToImageTaskResult(path=output_path)

    async def render_htmls_to_images(
        self,
        htmls: list[str],
        width: int,
        height: int,
    ) -> HtmlToImagesTaskResult:
        if not htmls:
            raise HTTPException(
                status_code=400,
                detail="At least one HTML document is required",
            )
        if width <= 0 or height <= 0:
            raise HTTPException(
                status_code=400,
                detail="HTML-to-image dimensions must be positive",
            )

        try:
            response_data = await self._run_task(
                {
                    "type": "html-to-images",
                    "htmls": htmls,
                    "width": width,
                    "height": height,
                },
                "HTML-to-images export task did not produce a response file",
            )
        except HTTPException as exc:
            if "Invalid task type" not in str(exc.detail):
                raise
            LOGGER.warning(
                "[export_runtime] html-to-images is unavailable; "
                "falling back to one task per HTML document"
            )
            results = [
                await self.render_html_to_image(html, width, height) for html in htmls
            ]
            return HtmlToImagesTaskResult(paths=[result.path for result in results])

        raw_paths = response_data.get("file_paths")
        if not isinstance(raw_paths, list) or len(raw_paths) != len(htmls):
            raise HTTPException(
                status_code=500,
                detail="HTML-to-images export task produced invalid output",
            )

        output_paths = [
            self._resolve_output_path({"file_path": raw_path}) for raw_path in raw_paths
        ]
        for output_path in output_paths:
            self._ensure_output_readable(output_path)

        return HtmlToImagesTaskResult(paths=output_paths)

    async def extract_schema(self, url: str) -> ExtractSchemaDocument:
        LOGGER.info(
            "[export_runtime] extract_schema spawn "
            "url=%s entrypoint=%s export_dir=%s",
            url,
            self.entrypoint_path,
            self.export_dir,
        )
        try:
            response_data = await self._run_task(
                {
                    "type": "extract-schema",
                    "url": url,
                },
                "Extract-schema task did not produce a response file",
            )
            slides = response_data.get("slides") if isinstance(response_data, dict) else None
            slide_n = len(slides) if isinstance(slides, list) else "?"
            LOGGER.info(
                "[export_runtime] extract_schema node finished url=%s "
                "response_name=%r ordered=%s icon_weight=%s slides=%s",
                url,
                response_data.get("name") if isinstance(response_data, dict) else None,
                response_data.get("ordered") if isinstance(response_data, dict) else None,
                response_data.get("icon_weight") if isinstance(response_data, dict) else None,
                slide_n,
            )
            return ExtractSchemaDocument(**response_data)
        except ValidationError as exc:
            LOGGER.exception(
                "[export_runtime] extract_schema pydantic validation failed url=%s",
                url,
            )
            raise HTTPException(
                status_code=500,
                detail="Extract-schema task produced invalid output",
            ) from exc


def sys_platform() -> str:
    if os.name == "nt":
        return "win32"
    return os.sys.platform


def sys_arch() -> str:
    machine = (os.environ.get("PROCESSOR_ARCHITECTURE") or "").lower()
    if not machine and hasattr(os, "uname"):
        machine = os.uname().machine.lower()

    arch_map = {
        "x86_64": "x64",
        "amd64": "x64",
        "x64": "x64",
        "aarch64": "arm64",
        "arm64": "arm64",
    }
    return arch_map.get(machine, machine or "x64")


EXPORT_TASK_SERVICE = ExportTaskService()
