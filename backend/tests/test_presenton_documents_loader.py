from __future__ import annotations

import asyncio
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


def _make_multi_page_pdf(path: Path, page_texts: list[str]) -> None:
    doc = fitz.open()
    for text in page_texts:
        page = doc.new_page()
        if text:
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


def test_documents_loader_uses_liteparse_for_non_scanned_pdf(monkeypatch):
    temp_dir = Path(TEMP_FILE_SERVICE.create_temp_dir())
    pdf_path = temp_dir / "lecture.pdf"
    _make_pdf(pdf_path, "Native digital PDF text")

    monkeypatch.setenv("PDF_OCR_PROVIDER", "auto")
    monkeypatch.setenv("UNLIMITED_OCR_ENABLED", "true")

    loader = DocumentsLoader([str(pdf_path)], presentation_language="en")

    monkeypatch.setattr(loader, "_is_scanned_pdf", lambda *_args, **_kwargs: False)
    monkeypatch.setattr(
        loader.unlimited_ocr_service,
        "parse_pdf_to_markdown",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("Unlimited-OCR should not be used for non-scanned PDFs in auto mode")
        ),
    )
    monkeypatch.setattr(
        loader.liteparse_service,
        "parse_to_markdown",
        lambda *_args, **_kwargs: "liteparse result",
    )

    document, _ = asyncio.run(loader.load_pdf(str(pdf_path), True, False))

    assert document == "liteparse result"


def test_documents_loader_uses_unlimited_ocr_for_scanned_pdf(monkeypatch):
    temp_dir = Path(TEMP_FILE_SERVICE.create_temp_dir())
    pdf_path = temp_dir / "scan.pdf"
    _make_pdf(pdf_path, "Scanned fallback text")

    monkeypatch.setenv("PDF_OCR_PROVIDER", "auto")
    monkeypatch.setenv("UNLIMITED_OCR_ENABLED", "true")
    monkeypatch.setenv("UNLIMITED_OCR_MAX_PAGES", "32")

    loader = DocumentsLoader([str(pdf_path)], presentation_language="en")

    monkeypatch.setattr(loader, "_is_scanned_pdf", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(
        loader.unlimited_ocr_service,
        "parse_pdf_to_markdown",
        lambda *_args, **_kwargs: "unlimited ocr result",
    )
    monkeypatch.setattr(
        loader.liteparse_service,
        "parse_to_markdown",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("LiteParse should not be called when Unlimited-OCR succeeds")
        ),
    )

    document, _ = asyncio.run(loader.load_pdf(str(pdf_path), True, False))

    assert document == "unlimited ocr result"


def test_documents_loader_falls_back_when_unlimited_ocr_fails(monkeypatch):
    temp_dir = Path(TEMP_FILE_SERVICE.create_temp_dir())
    pdf_path = temp_dir / "scan-fallback.pdf"
    _make_pdf(pdf_path, "Scanned fallback text")

    monkeypatch.setenv("PDF_OCR_PROVIDER", "auto")
    monkeypatch.setenv("UNLIMITED_OCR_ENABLED", "true")

    loader = DocumentsLoader([str(pdf_path)], presentation_language="en")

    monkeypatch.setattr(loader, "_is_scanned_pdf", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(
        loader.unlimited_ocr_service,
        "parse_pdf_to_markdown",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("server down")),
    )
    monkeypatch.setattr(
        loader.liteparse_service,
        "parse_to_markdown",
        lambda *_args, **_kwargs: "liteparse fallback result",
    )

    document, _ = asyncio.run(loader.load_pdf(str(pdf_path), True, False))

    assert document == "liteparse fallback result"


def test_documents_loader_skips_unlimited_ocr_for_large_pdf(monkeypatch):
    temp_dir = Path(TEMP_FILE_SERVICE.create_temp_dir())
    pdf_path = temp_dir / "large-scan.pdf"
    _make_multi_page_pdf(pdf_path, ["page 1", "page 2"])

    monkeypatch.setenv("PDF_OCR_PROVIDER", "auto")
    monkeypatch.setenv("UNLIMITED_OCR_ENABLED", "true")
    monkeypatch.setenv("UNLIMITED_OCR_MAX_PAGES", "1")

    loader = DocumentsLoader([str(pdf_path)], presentation_language="en")

    monkeypatch.setattr(loader, "_is_scanned_pdf", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(
        loader.unlimited_ocr_service,
        "parse_pdf_to_markdown",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("Unlimited-OCR should be skipped when page count exceeds the limit")
        ),
    )
    monkeypatch.setattr(
        loader.liteparse_service,
        "parse_to_markdown",
        lambda *_args, **_kwargs: "liteparse oversized fallback",
    )

    document, _ = asyncio.run(loader.load_pdf(str(pdf_path), True, False))

    assert document == "liteparse oversized fallback"
