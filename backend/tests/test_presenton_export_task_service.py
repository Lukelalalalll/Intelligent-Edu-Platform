from __future__ import annotations

import importlib.util
import json
import pathlib
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

from fastapi import HTTPException


ROOT = pathlib.Path(__file__).resolve().parents[2]


def _install_stub_modules() -> None:
    services_pkg = types.ModuleType("services")
    services_pkg.__path__ = []
    sys.modules["services"] = services_pkg

    liteparse_service = types.ModuleType("services.liteparse_service")
    liteparse_service._command_str = lambda command: " ".join(str(part) for part in command)
    liteparse_service._snippet = lambda text: text
    sys.modules["services.liteparse_service"] = liteparse_service

    utils_pkg = types.ModuleType("utils")
    utils_pkg.__path__ = []
    sys.modules["utils"] = utils_pkg

    asset_directory_utils = types.ModuleType("utils.asset_directory_utils")
    asset_directory_utils.get_exports_directory = lambda: tempfile.gettempdir()
    asset_directory_utils.resolve_app_path_to_filesystem = lambda value: value
    sys.modules["utils.asset_directory_utils"] = asset_directory_utils

    get_env = types.ModuleType("utils.get_env")
    get_env.get_app_data_directory_env = lambda: tempfile.gettempdir()
    get_env.get_fastapi_public_base_url = lambda: "http://127.0.0.1:8000"
    get_env.get_temp_directory_env = lambda: tempfile.gettempdir()
    sys.modules["utils.get_env"] = get_env

    icon_weights = types.ModuleType("utils.icon_weights")
    icon_weights.DEFAULT_ICON_WEIGHT = "regular"
    icon_weights.extract_icon_weight_from_settings = lambda settings: settings.get(
        "icon_weight", "regular"
    )
    sys.modules["utils.icon_weights"] = icon_weights

    runtime_limits = types.ModuleType("utils.runtime_limits")

    class BoundedTextBuffer:
        def __init__(self, limit: int = 4096):
            self._limit = limit
            self._value = ""

        def append(self, text: str) -> None:
            self._value = (self._value + text)[-self._limit :]

        def get(self) -> str:
            return self._value

    runtime_limits.BoundedTextBuffer = BoundedTextBuffer
    runtime_limits.log_memory = lambda *args, **kwargs: None
    sys.modules["utils.runtime_limits"] = runtime_limits


def _load_export_task_service_module():
    _install_stub_modules()
    module_path = (
        ROOT / "backend" / "presenton_runtime" / "services" / "export_task_service.py"
    )
    spec = importlib.util.spec_from_file_location(
        "test_presenton_export_task_service_module",
        module_path,
    )
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class PresentonExportTaskServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.export_task_service = _load_export_task_service_module()

    def _make_runtime_service(self):
        service = self.export_task_service.ExportTaskService(timeout_seconds=1)
        runtime_dir = pathlib.Path(tempfile.mkdtemp())
        entrypoint = runtime_dir / "index.cjs"
        converter = runtime_dir / "py" / "convert-win32-x64.exe"
        converter.parent.mkdir(parents=True)
        entrypoint.write_text("console.log('ok')\n", encoding="utf-8")
        converter.write_bytes(b"MZ")
        service.export_dir = str(runtime_dir)
        service.entrypoint_path = str(entrypoint)
        service.converter_path = str(converter)
        return service, runtime_dir

    def test_ensure_runtime_ready_installs_missing_sharp(self) -> None:
        service, _runtime_dir = self._make_runtime_service()

        with patch.object(
            service,
            "_runtime_dependency_missing_detail",
            side_effect=[
                "Export runtime native dependency 'sharp' is unavailable.",
                None,
            ],
        ) as dependency_mock, patch.object(
            service,
            "_install_runtime_native_dependencies",
            return_value=None,
        ) as install_mock:
            service._ensure_runtime_ready()

        self.assertEqual(dependency_mock.call_count, 2)
        install_mock.assert_called_once_with()

    def test_ensure_runtime_ready_raises_when_sharp_still_missing(self) -> None:
        service, _runtime_dir = self._make_runtime_service()

        with patch.object(
            service,
            "_runtime_dependency_missing_detail",
            side_effect=[
                "Export runtime native dependency 'sharp' is unavailable.",
                "Export runtime native dependency 'sharp' is unavailable.",
            ],
        ), patch.object(
            service,
            "_install_runtime_native_dependencies",
            return_value="Export runtime dependency install failed.",
        ):
            with self.assertRaises(HTTPException) as exc_info:
                service._ensure_runtime_ready()

        self.assertEqual(exc_info.exception.status_code, 500)
        self.assertIn("native dependency 'sharp' is unavailable", str(exc_info.exception.detail))
        self.assertIn("dependency install failed", str(exc_info.exception.detail))

    def test_install_runtime_native_dependencies_creates_package_manifest(self) -> None:
        service, runtime_dir = self._make_runtime_service()
        captured: dict[str, object] = {}

        def fake_run(command, **kwargs):
            captured["command"] = command
            captured["cwd"] = kwargs["cwd"]
            captured["env"] = kwargs["env"]
            return subprocess.CompletedProcess(
                args=command,
                returncode=0,
                stdout="installed",
                stderr="",
            )

        with patch.object(
            service,
            "_build_runtime_dependency_env",
            return_value={"PATH": ""},
        ), patch.object(self.export_task_service.subprocess, "run", side_effect=fake_run):
            error = service._install_runtime_native_dependencies()

        self.assertIsNone(error)
        self.assertEqual(captured["cwd"], str(runtime_dir))
        self.assertIn("install", captured["command"])
        self.assertIn(
            f"sharp@{self.export_task_service.EXPORT_RUNTIME_SHARP_VERSION}",
            captured["command"],
        )

        package_json = json.loads((runtime_dir / "package.json").read_text(encoding="utf-8"))
        self.assertEqual(package_json["name"], "presentation-export-runtime")
        self.assertTrue(package_json["private"])


if __name__ == "__main__":
    unittest.main()
