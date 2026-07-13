"""Shared wrapper around the optional opendataloader_pdf package."""

from __future__ import annotations

import glob
from pathlib import Path
from typing import Any

try:
    import opendataloader_pdf as _opendataloader_pdf
except ModuleNotFoundError:
    _opendataloader_pdf = None  # type: ignore[assignment]


class PDFLoaderError(RuntimeError):
    """Base error for OpenDataLoader wrapper failures."""


class PDFLoaderUnavailable(PDFLoaderError):
    """Raised when opendataloader_pdf or its runtime is unavailable."""


class PDFLoaderConversionError(PDFLoaderError):
    """Raised when OpenDataLoader runs but cannot produce the expected output."""


def is_pdf_loader_available() -> bool:
    return _opendataloader_pdf is not None


def convert_pdf(input_path: str, output_dir: str, **options: Any) -> None:
    """Run opendataloader_pdf.convert with normalized failure types."""
    if _opendataloader_pdf is None:
        raise PDFLoaderUnavailable("opendataloader_pdf is not installed")

    try:
        _opendataloader_pdf.convert(
            input_path=input_path,
            output_dir=output_dir,
            **options,
        )
    except FileNotFoundError as exc:
        raise PDFLoaderUnavailable("OpenDataLoader runtime is unavailable") from exc
    except Exception as exc:  # noqa: BLE001 - normalize external package failures.
        raise PDFLoaderConversionError(str(exc)) from exc


def _newest(paths: list[str]) -> str | None:
    existing = [path for path in paths if Path(path).exists()]
    if not existing:
        return None
    return max(existing, key=lambda path: Path(path).stat().st_mtime)


def find_markdown_output(output_dir: str, input_path: str) -> str | None:
    """Locate markdown emitted by opendataloader_pdf for an input PDF."""
    output = Path(output_dir)
    stem = Path(input_path).stem
    direct_candidates = [
        str(output / f"{stem}.md"),
        str(output / f"{stem}_markdown.md"),
    ]
    direct_match = next((path for path in direct_candidates if Path(path).exists()), None)
    if direct_match:
        return direct_match

    stem_matches = glob.glob(str(output / f"{stem}*.md"))
    return _newest(stem_matches) or _newest(glob.glob(str(output / "*.md")))


def find_json_output(output_dir: str, input_path: str) -> str | None:
    """Locate JSON emitted by opendataloader_pdf for an input PDF."""
    output = Path(output_dir)
    stem = Path(input_path).stem
    return _newest(glob.glob(str(output / f"{stem}*.json"))) or _newest(
        glob.glob(str(output / "*.json"))
    )


def read_markdown_output(output_dir: str, input_path: str) -> str:
    md_path = find_markdown_output(output_dir, input_path)
    if not md_path:
        raise PDFLoaderConversionError("OpenDataLoader did not produce markdown output")
    return Path(md_path).read_text(encoding="utf-8", errors="replace")
