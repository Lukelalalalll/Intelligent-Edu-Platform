from __future__ import annotations

import ast
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[2]
PRESENTATION_ENDPOINT = (
    ROOT / "backend" / "presenton_runtime" / "api" / "v1" / "ppt" / "endpoints" / "presentation.py"
)


class PresentonStreamStatusTests(unittest.TestCase):
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
