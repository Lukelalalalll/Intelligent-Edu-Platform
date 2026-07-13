from __future__ import annotations

import ast
import importlib
import pathlib
import sys
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[2]
PRESENTATION_ENDPOINT = (
    ROOT / "backend" / "presenton_runtime" / "api" / "v1" / "ppt" / "endpoints" / "presentation" / "streaming.py"
)


class PresentonStreamStatusTests(unittest.TestCase):
    def test_presentation_router_import_path_remains_available(self) -> None:
        runtime_root = ROOT / "backend" / "presenton_runtime"
        sys.path.insert(0, str(runtime_root))
        try:
            module = importlib.import_module("api.v1.ppt.endpoints.presentation")
            self.assertTrue(hasattr(module, "PRESENTATION_ROUTER"))
        finally:
            sys.path.pop(0)

    def test_stream_inner_emits_starting_status_before_heavy_work(self) -> None:
        source = PRESENTATION_ENDPOINT.read_text(encoding="utf-8")
        module = ast.parse(source)

        stream_fn = next(
            node
            for node in module.body
            if isinstance(node, ast.AsyncFunctionDef)
            and node.name == "stream_presentation"
        )
        inner_fn = next(
            node
            for node in stream_fn.body
            if isinstance(node, ast.AsyncFunctionDef) and node.name == "inner"
        )
        first_stmt = inner_fn.body[0]

        self.assertIsInstance(first_stmt, ast.Expr)
        self.assertIsInstance(first_stmt.value, ast.Yield)

        yielded_call = first_stmt.value.value
        self.assertIsInstance(yielded_call, ast.Call)
        self.assertIsInstance(yielded_call.func, ast.Attribute)
        self.assertEqual(yielded_call.func.attr, "to_string")

        constructor = yielded_call.func.value
        self.assertIsInstance(constructor, ast.Call)
        self.assertIsInstance(constructor.func, ast.Name)
        self.assertEqual(constructor.func.id, "SSEStatusResponse")

        keyword_map = {keyword.arg: keyword.value for keyword in constructor.keywords}
        self.assertIn("status", keyword_map)
        self.assertIsInstance(keyword_map["status"], ast.Constant)
        self.assertEqual(keyword_map["status"].value, "starting")


if __name__ == "__main__":
    unittest.main()
