from __future__ import annotations

import json
import os
import tempfile
from typing import Mapping

from fastapi import HTTPException

from utils.get_env import (
    get_app_data_directory_env,
    get_fastapi_public_base_url,
    get_temp_directory_env,
)

from .runtime_paths import refresh_runtime_paths, resolve_export_sync_script

EXPORT_RUNTIME_SHARP_VERSION = os.getenv("EXPORT_RUNTIME_SHARP_VERSION", "^0.34.5").strip() or "^0.34.5"


def build_node_env(service, *, asset_base_url: str | None = None) -> Mapping[str, str]:
    env = os.environ.copy()
    app_data_directory = get_app_data_directory_env()
    if not app_data_directory:
        raise HTTPException(status_code=500, detail="APP_DATA_DIRECTORY must be set for PPTX-to-HTML export")
    env["APP_DATA_DIRECTORY"] = app_data_directory

    temp_directory = get_temp_directory_env() or os.path.join(tempfile.gettempdir(), "presenton")
    os.makedirs(temp_directory, exist_ok=True)
    env["TEMP_DIRECTORY"] = temp_directory

    puppeteer_temp_directory = env.get("PUPPETEER_TMP_DIR") or os.path.join(temp_directory, "puppeteer")
    os.makedirs(puppeteer_temp_directory, exist_ok=True)
    env["PUPPETEER_TMP_DIR"] = puppeteer_temp_directory

    puppeteer_cache_directory = env.get("PUPPETEER_CACHE_DIR") or os.path.join(temp_directory, "puppeteer-cache")
    os.makedirs(puppeteer_cache_directory, exist_ok=True)
    env["PUPPETEER_CACHE_DIR"] = puppeteer_cache_directory

    fastapi_base = (asset_base_url or get_fastapi_public_base_url() or "").strip()
    if not fastapi_base:
        raise HTTPException(
            status_code=500,
            detail="A public Presenton asset base URL is required for PPTX-to-HTML export",
        )
    env["ASSETS_BASE_URL"] = f"{fastapi_base.rstrip('/')}/app_data"
    env["BUILT_PYTHON_MODULE_PATH"] = service.converter_path

    node_path_entries = resolve_export_node_path_entries(service, env)
    if node_path_entries:
        env["NODE_PATH"] = os.pathsep.join(node_path_entries)

    puppeteer_executable_path = resolve_puppeteer_executable_path(env)
    if puppeteer_executable_path:
        env["PUPPETEER_EXECUTABLE_PATH"] = puppeteer_executable_path
    return env


def resolve_export_node_path_entries(service, env: Mapping[str, str] | None = None) -> list[str]:
    env = env or os.environ
    configured_paths = [entry.strip() for entry in (env.get("NODE_PATH") or "").split(os.pathsep) if entry.strip()]
    runtime_paths = [
        entry.strip()
        for entry in (os.getenv("EXPORT_RUNTIME_NODE_PATH") or "").split(os.pathsep)
        if entry.strip()
    ]
    export_dir = os.path.abspath(service.export_dir or "")
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


def resolve_puppeteer_executable_path(env: Mapping[str, str] | None = None) -> str | None:
    env = env or os.environ
    configured = (env.get("PUPPETEER_EXECUTABLE_PATH") or "").strip()
    if configured and os.path.isfile(configured):
        return configured
    for candidate in chrome_executable_candidates():
        if os.path.isfile(candidate):
            return candidate
    return None


def chrome_executable_candidates() -> list[str]:
    if os.name == "nt":
        local_app_data = (os.environ.get("LOCALAPPDATA") or "").strip()
        candidates = [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            r"D:\Program Files\Google\Chrome\Application\chrome.exe",
            r"D:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        ]
        if local_app_data:
            candidates.append(os.path.join(local_app_data, "Google", "Chrome", "Application", "chrome.exe"))
        return candidates
    if os.sys.platform == "darwin":
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


def runtime_missing_detail(service) -> str | None:
    if not os.path.isfile(service.entrypoint_path):
        return f"Export runtime not found at {service.entrypoint_path}"
    if not os.path.isfile(service.converter_path):
        return f"Export converter binary not found at {service.converter_path}"
    return None


def npm_binary() -> str:
    return "npm.cmd" if os.name == "nt" else "npm"


def build_runtime_dependency_env(service) -> dict[str, str]:
    env = os.environ.copy()
    node_path_entries = resolve_export_node_path_entries(service, env)
    if node_path_entries:
        env["NODE_PATH"] = os.pathsep.join(node_path_entries)
    return env


def runtime_dependency_missing_detail(service, *, subprocess_module, snippet, hidden_subprocess_kwargs) -> str | None:
    if not os.path.isfile(service.entrypoint_path):
        return None
    command = [service.node_binary, "-e", "require('sharp')"]
    try:
        result = subprocess_module.run(
            command,
            cwd=service.export_dir,
            env=service._build_runtime_dependency_env(),
            stdout=subprocess_module.PIPE,
            stderr=subprocess_module.PIPE,
            text=True,
            check=False,
            **hidden_subprocess_kwargs(),
        )
    except OSError as exc:
        return f"Failed to validate export runtime native dependencies: {exc}"
    if result.returncode == 0:
        return None
    return (
        "Export runtime native dependency 'sharp' is unavailable. "
        f"returncode={result.returncode} "
        f"stderr={snippet(result.stderr)} stdout={snippet(result.stdout)}"
    )


def ensure_runtime_package_manifest(service) -> None:
    package_json_path = os.path.join(service.export_dir, "package.json")
    if os.path.isfile(package_json_path):
        return
    os.makedirs(service.export_dir, exist_ok=True)
    with open(package_json_path, "w", encoding="utf-8") as package_file:
        json.dump({"name": "presentation-export-runtime", "private": True}, package_file, indent=2)
        package_file.write("\n")


def install_runtime_native_dependencies(
    service,
    *,
    subprocess_module,
    command_str,
    snippet,
    hidden_subprocess_kwargs,
    logger,
) -> str | None:
    if (os.getenv("ENSURE_PRESENTATION_EXPORT_RUNTIME") or "").strip().lower() == "false":
        return "Automatic export runtime dependency install is disabled by ENSURE_PRESENTATION_EXPORT_RUNTIME=false."
    try:
        ensure_runtime_package_manifest(service)
    except OSError as exc:
        return f"Failed to prepare export runtime package manifest: {exc}"

    command = [
        npm_binary(),
        "install",
        f"sharp@{EXPORT_RUNTIME_SHARP_VERSION}",
        "--include=optional",
        "--omit=dev",
        "--no-fund",
        "--no-audit",
        "--no-package-lock",
    ]
    logger.info("[export_runtime] installing native dependency via %s", command_str(command))
    try:
        result = subprocess_module.run(
            command,
            cwd=service.export_dir,
            env=service._build_runtime_dependency_env(),
            stdout=subprocess_module.PIPE,
            stderr=subprocess_module.PIPE,
            text=True,
            check=False,
            **hidden_subprocess_kwargs(),
        )
    except OSError as exc:
        return f"Failed to start export runtime dependency install: {exc}"
    if result.returncode != 0:
        return (
            "Export runtime dependency install failed. "
            f"returncode={result.returncode} "
            f"stderr={snippet(result.stderr)} stdout={snippet(result.stdout)}"
        )
    return None


def sync_runtime(service, *, subprocess_module, snippet, hidden_subprocess_kwargs, logger) -> str | None:
    if (os.getenv("ENSURE_PRESENTATION_EXPORT_RUNTIME") or "").strip().lower() == "false":
        return "Automatic export runtime sync is disabled by ENSURE_PRESENTATION_EXPORT_RUNTIME=false."
    sync_script = resolve_export_sync_script(service.export_dir, service_file=service.service_file)
    if not sync_script:
        return "Export runtime sync script not found. Run node scripts/sync-presentation-export.cjs from the repo root."
    repo_root = os.path.dirname(os.path.dirname(sync_script))
    logger.info("[export_runtime] syncing missing runtime via %s", sync_script)
    try:
        result = subprocess_module.run(
            [service.node_binary, sync_script],
            cwd=repo_root,
            env=os.environ.copy(),
            stdout=subprocess_module.PIPE,
            stderr=subprocess_module.PIPE,
            text=True,
            check=False,
            **hidden_subprocess_kwargs(),
        )
    except OSError as exc:
        return f"Failed to start export runtime sync: {exc}"
    if result.returncode != 0:
        return (
            "Export runtime sync failed. "
            f"returncode={result.returncode} "
            f"stderr={snippet(result.stderr)} stdout={snippet(result.stdout)}"
        )
    refresh_runtime_paths(service)
    return None


def ensure_runtime_ready(service) -> None:
    missing_detail = service._runtime_missing_detail()
    if missing_detail:
        sync_error = service._sync_runtime()
        missing_detail = service._runtime_missing_detail()
        if missing_detail:
            if not sync_error:
                sync_error = "Automatic export runtime sync completed but the runtime is still unavailable."
            raise HTTPException(status_code=500, detail=f"{missing_detail}. {sync_error}")

    dependency_detail = service._runtime_dependency_missing_detail()
    if not dependency_detail:
        return

    install_error = service._install_runtime_native_dependencies()
    dependency_detail = service._runtime_dependency_missing_detail()
    if not dependency_detail:
        return
    if not install_error:
        install_error = (
            "Automatic export runtime dependency install completed but the native dependency is still unavailable."
        )
    raise HTTPException(status_code=500, detail=f"{dependency_detail}. {install_error}")
