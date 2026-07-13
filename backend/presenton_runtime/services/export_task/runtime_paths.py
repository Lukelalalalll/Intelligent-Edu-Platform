from __future__ import annotations

import os
import shutil


def refresh_runtime_paths(service) -> None:
    service.export_dir = resolve_export_dir(service_file=service.service_file)
    service.entrypoint_path = resolve_entrypoint_path(service.export_dir)
    service.converter_path = resolve_converter_path(service.export_dir)


def resolve_export_dir(*, service_file: str) -> str:
    configured = (os.getenv("EXPORT_RUNTIME_DIR") or "").strip()
    if configured:
        return configured

    package_root = (os.getenv("EXPORT_PACKAGE_ROOT") or "").strip()
    if package_root:
        return package_root

    cwd = os.path.abspath(".")
    service_dir = os.path.dirname(service_file)
    candidates = [
        os.path.abspath(os.path.join(cwd, "..", "..", "presentation-export")),
        os.path.abspath(os.path.join(cwd, "..", "presentation-export")),
        os.path.abspath(os.path.join(service_dir, "..", "..", "..", "presentation-export")),
        os.path.abspath(os.path.join(service_dir, "..", "..", "..", "..", "presentation-export")),
    ]
    for candidate in candidates:
        if os.path.isfile(os.path.join(candidate, "index.cjs")) or os.path.isfile(os.path.join(candidate, "index.js")):
            return candidate
    return candidates[0]


def resolve_entrypoint_path(export_dir: str) -> str:
    index_cjs = os.path.join(export_dir, "index.cjs")
    if os.path.isfile(index_cjs):
        return index_cjs

    index_js = os.path.join(export_dir, "index.js")
    if os.path.isfile(index_js):
        try:
            shutil.copyfile(index_js, index_cjs)
            return index_cjs
        except OSError:
            return index_js

    return index_cjs


def resolve_converter_path(export_dir: str) -> str:
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
                candidates.append(os.path.join(candidate_dir, f"convert-{platform_name}-{arch_name}{extension}"))
            candidates.append(os.path.join(candidate_dir, f"convert-{platform_name}{extension}"))
        if os.name == "nt":
            candidates.append(os.path.join(candidate_dir, "convert.exe"))
        candidates.extend([os.path.join(candidate_dir, f"convert{extension}"), os.path.join(candidate_dir, "convert")])
    candidates = list(dict.fromkeys(candidates))
    for candidate in candidates:
        if candidate and os.path.isfile(candidate):
            return candidate
    return candidates[0]


def resolve_export_sync_script(export_dir: str, *, service_file: str) -> str | None:
    configured = (os.getenv("EXPORT_RUNTIME_SYNC_SCRIPT") or "").strip()
    if configured:
        return configured

    cwd = os.path.abspath(".")
    service_dir = os.path.dirname(service_file)
    candidates = [
        os.path.join(os.path.dirname(export_dir), "scripts", "sync-presentation-export.cjs"),
        os.path.join(cwd, "scripts", "sync-presentation-export.cjs"),
        os.path.join(cwd, "..", "scripts", "sync-presentation-export.cjs"),
        os.path.join(service_dir, "..", "..", "..", "scripts", "sync-presentation-export.cjs"),
        os.path.join(service_dir, "..", "..", "..", "..", "scripts", "sync-presentation-export.cjs"),
    ]
    for candidate in candidates:
        resolved = os.path.abspath(candidate)
        if os.path.isfile(resolved):
            return resolved
    return None


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
