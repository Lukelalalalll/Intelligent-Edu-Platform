from __future__ import annotations

from pathlib import Path

import fitz
import pytest

from backend.utils import pdf_loader_adapter
from backend.utils.pdf_loader_adapter import (
    PDFLoaderConversionError,
    PDFLoaderUnavailable,
)


def _make_pdf(path: Path, text: str) -> None:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), text)
    doc.save(path)
    doc.close()


def test_find_markdown_output_supports_expected_names(tmp_path):
    pdf_path = tmp_path / "lesson.pdf"
    first = tmp_path / "lesson.md"
    generated = tmp_path / "lesson_markdown.md"
    fallback = tmp_path / "other.md"

    generated.write_text("generated", encoding="utf-8")
    fallback.write_text("fallback", encoding="utf-8")
    assert pdf_loader_adapter.find_markdown_output(str(tmp_path), str(pdf_path)) == str(generated)

    generated.unlink()
    first.write_text("first", encoding="utf-8")
    assert pdf_loader_adapter.find_markdown_output(str(tmp_path), str(pdf_path)) == str(first)

    first.unlink()
    assert pdf_loader_adapter.find_markdown_output(str(tmp_path), str(pdf_path)) == str(fallback)


def test_convert_pdf_normalizes_backend_failures(monkeypatch, tmp_path):
    class FailingBackend:
        @staticmethod
        def convert(**_kwargs):
            raise RuntimeError("boom")

    monkeypatch.setattr(pdf_loader_adapter, "_opendataloader_pdf", FailingBackend())

    with pytest.raises(PDFLoaderConversionError):
        pdf_loader_adapter.convert_pdf(
            input_path=str(tmp_path / "input.pdf"),
            output_dir=str(tmp_path),
            format="markdown",
        )


def test_question_pdf_extraction_falls_back_when_loader_missing(monkeypatch, tmp_path):
    from backend.services.questions import pdf_extraction

    pdf_path = tmp_path / "exercise.pdf"
    _make_pdf(pdf_path, "Fallback extraction text")
    monkeypatch.setattr(pdf_extraction, "is_pdf_loader_available", lambda: False)

    text = pdf_extraction.extract_pdf_text_with_loader(str(pdf_path), [0])

    assert "Fallback extraction text" in text


def test_slides_pdf_to_md_falls_back_when_loader_unavailable(monkeypatch, tmp_path):
    from backend.services.slides.parsing import pdf2md

    pdf_path = tmp_path / "slides.pdf"
    output_path = tmp_path / "slides.md"
    _make_pdf(pdf_path, "Slide fallback text")

    def _missing_loader(**_kwargs):
        raise PDFLoaderUnavailable("missing")

    monkeypatch.setattr(pdf2md, "convert_pdf", _missing_loader)

    pdf2md.convert_pdf_to_md(str(pdf_path), str(output_path))

    text = output_path.read_text(encoding="utf-8")
    assert "# slides" in text
    assert "Slide fallback text" in text
