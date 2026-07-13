from __future__ import annotations

import importlib.util
import pathlib
import sys
import types
import unittest
import uuid
from urllib.parse import parse_qs, urlparse


ROOT = pathlib.Path(__file__).resolve().parents[2]


def _install_stub_modules() -> None:
    pathvalidate = types.ModuleType("pathvalidate")
    pathvalidate.sanitize_filename = lambda value: value
    sys.modules["pathvalidate"] = pathvalidate

    models_pkg = types.ModuleType("models")
    models_pkg.__path__ = []
    sys.modules["models"] = models_pkg

    presentation_and_path = types.ModuleType("models.presentation_and_path")

    class PresentationAndPath:
        def __init__(self, presentation_id=None, path=None):
            self.presentation_id = presentation_id
            self.path = path

    presentation_and_path.PresentationAndPath = PresentationAndPath
    sys.modules["models.presentation_and_path"] = presentation_and_path

    utils_pkg = types.ModuleType("utils")
    utils_pkg.__path__ = []
    sys.modules["utils"] = utils_pkg

    get_env = types.ModuleType("utils.get_env")
    get_env.get_fastapi_public_base_url = lambda: None
    sys.modules["utils.get_env"] = get_env

    filename_utils = types.ModuleType("utils.filename_utils")
    filename_utils.safe_export_basename = lambda value: value
    sys.modules["utils.filename_utils"] = filename_utils

    runtime_limits = types.ModuleType("utils.runtime_limits")
    runtime_limits.log_memory = lambda *args, **kwargs: None
    sys.modules["utils.runtime_limits"] = runtime_limits

    services_pkg = types.ModuleType("services")
    services_pkg.__path__ = []
    sys.modules["services"] = services_pkg

    export_task_service = types.ModuleType("services.export_task_service")
    export_task_service.EXPORT_TASK_SERVICE = object()
    sys.modules["services.export_task_service"] = export_task_service


def _load_export_utils_module():
    _install_stub_modules()
    module_path = ROOT / "backend" / "presenton_runtime" / "utils" / "export_utils.py"
    spec = importlib.util.spec_from_file_location("test_presenton_export_utils_module", module_path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class PresentonExportUtilsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.export_utils = _load_export_utils_module()

    def test_build_export_url_keeps_export_cookie_fragment_when_session_exists(self) -> None:
        presentation_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
        cookie_header = "presenton_session=session-123; access_token=jwt-abc; other=value"

        export_url, fastapi_url = self.export_utils._build_presentation_export_url(
            presentation_id,
            "pptx",
            cookie_header,
            web_origin="http://localhost:5173",
        )

        parsed = urlparse(export_url)
        query = parse_qs(parsed.query)

        self.assertIsNone(fastapi_url)
        self.assertEqual(query["id"], [str(presentation_id)])
        self.assertEqual(query["exportAs"], ["pptx"])
        self.assertEqual(query["exportSession"], ["session-123"])
        self.assertTrue(parsed.fragment.startswith("exportCookie="))
        self.assertIn("access_token%3Djwt-abc", parsed.fragment)

    def test_build_export_url_uses_cookie_fragment_without_presenton_session(self) -> None:
        presentation_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
        cookie_header = "access_token=jwt-only"

        export_url, _ = self.export_utils._build_presentation_export_url(
            presentation_id,
            "pdf",
            cookie_header,
            web_origin="http://localhost:5173",
        )

        parsed = urlparse(export_url)
        query = parse_qs(parsed.query)

        self.assertEqual(query["exportAs"], ["pdf"])
        self.assertNotIn("exportSession", query)
        self.assertEqual(parsed.fragment, "exportCookie=access_token%3Djwt-only")


if __name__ == "__main__":
    unittest.main()
