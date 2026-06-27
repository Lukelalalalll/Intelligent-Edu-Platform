from __future__ import annotations

import sys
from pathlib import Path

import fitz

_PRESENTON_RUNTIME_ROOT = Path(__file__).resolve().parents[1] / "presenton_runtime"
if str(_PRESENTON_RUNTIME_ROOT) not in sys.path:
    sys.path.insert(0, str(_PRESENTON_RUNTIME_ROOT))

from services.documents_loader import DocumentsLoader
from services.liteparse_service import LiteParseError
from services.temp_file_service import TEMP_FILE_SERVICE


def _make_pdf(path: Path, text: str) -> None:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), text)
    doc.save(path)
    doc.close()


def test_documents_loader_falls_back_to_native_pdf_text_when_liteparse_unavailable(
    monkeypatch,
):
    temp_dir = Path(TEMP_FILE_SERVICE.create_temp_dir())
    pdf_path = temp_dir / "notes.pdf"
    _make_pdf(pdf_path, "HTML4 notes fallback text")

    loader = DocumentsLoader([str(pdf_path)], presentation_language="en")
    loader.document_service = None

    def _raise_liteparse_error(*_args, **_kwargs):
        raise LiteParseError("LiteParse runner not found")

    monkeypatch.setattr(
        loader.liteparse_service,
        "parse_to_markdown",
        _raise_liteparse_error,
    )

    extracted = loader._parse_with_liteparse(str(pdf_path))

    assert "HTML4 notes fallback text" in extracted
