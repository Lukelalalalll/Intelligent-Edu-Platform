import asyncio
import json
import logging
import os
import re
import tempfile
import time
from pathlib import Path
from typing import Any, List, Optional, Tuple

import pdfplumber
from fastapi import HTTPException

from constants.documents import (
    IMAGE_EXTENSIONS,
    OFFICE_EXTENSIONS,
    PDF_EXTENSIONS,
    TEXT_EXTENSIONS,
)
from services.document_conversion_service import (
    DocumentConversionError,
    DocumentConversionService,
)
from services.liteparse_service import LiteParseError, LiteParseService
from services.office_document_service import (
    OfficeDocumentError,
    extract_office_document_text,
)
from services.temp_file_service import TEMP_FILE_SERVICE
from services.unlimited_ocr_service import UnlimitedOCRService
from utils.ocr_language import presentation_language_to_ocr_code

# Optional fallback converter (primarily useful on Windows)
try:
    from services.lightweight_document_service import DocumentService as DocumentServiceCls
except Exception:
    DocumentServiceCls = None

LOGGER = logging.getLogger(__name__)

_PDF_OCR_PROVIDERS = {"auto", "liteparse", "unlimited"}


def _unwrap_liteparse_json_line_if_stored(text: str) -> str:
    """If the whole JSON line from the LiteParse runner was stored as the document, keep only the text field."""
    if not text:
        return text
    s = text.lstrip()
    if not s.startswith("{"):
        return text
    try:
        payload = json.loads(s)
    except (json.JSONDecodeError, TypeError, ValueError):
        return text
    if not isinstance(payload, dict):
        return text
    if (
        payload.get("ok") is True
        and "filePath" in payload
        and isinstance(payload.get("text"), str)
    ):
        return payload["text"]
    return text


_RE_TEXT_KEY = re.compile(r'"text"\s*:\s*"')


def _json_unescape_quoted_value(s: str, content_start: int) -> str:
    """
    Unescape a JSON string value. `content_start` is the index of the first character
    *inside* the value (immediately after the opening quote of the "text" field).
    If the closing quote is missing (truncated), returns the unescaped rest of the string.
    """
    out: list[str] = []
    i = content_start
    n = len(s)
    while i < n:
        c = s[i]
        if c == "\\" and i + 1 < n:
            e = s[i + 1]
            if e in '"\\':
                out.append(e)
                i += 2
            elif e == "/":
                out.append("/")
                i += 2
            elif e == "b":
                out.append("\b")
                i += 2
            elif e == "f":
                out.append("\f")
                i += 2
            elif e == "n":
                out.append("\n")
                i += 2
            elif e == "r":
                out.append("\r")
                i += 2
            elif e == "t":
                out.append("\t")
                i += 2
            elif e == "u" and i + 5 < n:
                try:
                    out.append(chr(int(s[i + 2 : i + 6], 16)))
                except (ValueError, OverflowError):
                    out.append(s[i : i + 6])
                i += 6
            else:
                out.append(e)
                i += 2
        elif c == '"':
            return "".join(out)
        else:
            out.append(c)
            i += 1
    return "".join(out)


def _try_extract_liteparse_text_value_from_malformed_json(s: str) -> Optional[str]:
    """
    When json.loads failed (e.g. truncated or corrupt), find the "text" field value
    in a LiteParse-shaped object and return only the unescaped string body.
    """
    if not s.startswith("{"):
        return None
    head = s[:10000] if len(s) > 10000 else s
    if not ("ok" in head and "filePath" in head):
        return None
    m = _RE_TEXT_KEY.search(s)
    if not m:
        return None
    return _json_unescape_quoted_value(s, m.end())


def _clean_extracted_one_pass(t: str) -> str:
    for _ in range(3):
        nxt = _unwrap_liteparse_json_line_if_stored(t)
        if nxt == t:
            break
        t = nxt
    s = t.lstrip()
    if s.startswith("{"):
        m = _try_extract_liteparse_text_value_from_malformed_json(s)
        if m is not None:
            return m
    return t


def clean_extracted_document_text(text: str) -> str:
    """
    Return only the document body: strip LiteParse JSON wrappers, then drop any
    leading payload before the "text" value (handles truncated/invalid JSON).
    Multiple passes in case the inner body is again JSON-shaped.
    """
    if not text:
        return text
    t = text
    for _ in range(4):
        nxt = _clean_extracted_one_pass(t)
        if nxt == t:
            return t
        t = nxt
    return t


class DocumentsLoader:
    DECOMPOSE_TIMEOUT_SECONDS = 600

    def __init__(
        self,
        file_paths: List[str],
        presentation_language: Optional[str] = None,
    ):
        self._file_paths = TEMP_FILE_SERVICE.resolve_existing_temp_paths(file_paths)
        self._ocr_language = presentation_language_to_ocr_code(presentation_language)
        self.liteparse_service = LiteParseService(
            timeout_seconds=self.DECOMPOSE_TIMEOUT_SECONDS
        )
        self.unlimited_ocr_service = UnlimitedOCRService()
        self.document_conversion_service = DocumentConversionService()
        self.document_service: Any = (
            DocumentServiceCls() if DocumentServiceCls is not None else None
        )

        self._documents: List[str] = []
        self._images: List[List[str]] = []

    @property
    def documents(self):
        return self._documents

    @property
    def images(self):
        return self._images

    async def load_documents(
        self,
        temp_dir: Optional[str] = None,
        load_text: bool = True,
        load_images: bool = False,
    ):
        """If load_images is True, temp_dir must be provided"""

        documents: List[str] = []
        images: List[List[str]] = []

        for file_path in self._file_paths:
            if not os.path.exists(file_path):
                raise HTTPException(
                    status_code=404, detail=f"File {file_path} not found"
                )

            document = ""
            imgs: List[str] = []

            extension = Path(file_path).suffix.lower()
            LOGGER.info(
                "[DocumentsLoader] Processing file=%s extension=%s",
                file_path,
                extension,
            )

            if extension in PDF_EXTENSIONS:
                document, imgs = await self.load_pdf(
                    file_path, load_text, load_images, temp_dir
                )
            elif extension in TEXT_EXTENSIONS:
                document = await self.load_text(file_path)
            elif extension in OFFICE_EXTENSIONS:
                document = await asyncio.to_thread(
                    self.load_office_document,
                    file_path,
                )
            elif extension in IMAGE_EXTENSIONS:
                document = await asyncio.to_thread(
                    self.load_image,
                    file_path,
                    temp_dir,
                )
            else:
                document = await asyncio.to_thread(self._parse_with_liteparse, file_path)

            document = clean_extracted_document_text(document)
            documents.append(document)
            images.append(imgs)

        self._documents = documents
        self._images = images

    async def load_pdf(
        self,
        file_path: str,
        load_text: bool,
        load_images: bool,
        temp_dir: Optional[str] = None,
    ) -> Tuple[str, List[str]]:
        image_paths: List[str] = []
        document: str = ""

        if load_text:
            is_scanned = await asyncio.to_thread(self._is_scanned_pdf, file_path)
            document = await asyncio.to_thread(self._parse_pdf_text, file_path, is_scanned)

        if load_images:
            if temp_dir is None:
                raise HTTPException(
                    status_code=400,
                    detail="temp_dir is required when load_images is true",
                )
            image_paths = await self.get_page_images_from_pdf_async(file_path, temp_dir)

        return document, image_paths

    @staticmethod
    def _extract_pdf_text_with_pdfplumber(file_path: str) -> str:
        with pdfplumber.open(file_path) as pdf:
            chunks = [
                text.strip()
                for page in pdf.pages
                if (text := (page.extract_text() or "")).strip()
            ]
        return "\n\n".join(chunks).strip()

    @staticmethod
    def _extract_pdf_text_with_fitz(file_path: str) -> str:
        import fitz

        doc = fitz.open(file_path)
        try:
            chunks = [
                text.strip()
                for page in doc
                if (text := (page.get_text("text") or "")).strip()
            ]
        finally:
            doc.close()
        return "\n\n".join(chunks).strip()

    def _parse_pdf_with_native_fallback(self, file_path: str) -> str:
        errors: list[str] = []
        extractors = [
            ("pdfplumber", self._extract_pdf_text_with_pdfplumber),
            ("fitz", self._extract_pdf_text_with_fitz),
        ]
        for name, extractor in extractors:
            try:
                text = extractor(file_path)
            except Exception as exc:
                errors.append(f"{name}: {exc}")
                continue
            if text:
                return text
            errors.append(f"{name}: empty text")

        raise LiteParseError(
            "Native PDF fallback produced no text"
            + (f" ({'; '.join(errors)})" if errors else "")
        )

    @staticmethod
    def _is_scanned_pdf(file_path: str, sample_pages: int = 5, threshold: int = 50) -> bool:
        """Check if a PDF is scanned (image-only) by sampling pages for text content."""
        try:
            with pdfplumber.open(file_path) as pdf:
                total_chars = 0
                for i, page in enumerate(pdf.pages[:sample_pages]):
                    text = page.extract_text() or ""
                    total_chars += len(text.strip())
                return total_chars < threshold
        except Exception:
            return False

    def _get_pdf_ocr_provider(self) -> str:
        provider = (os.getenv("PDF_OCR_PROVIDER") or "auto").strip().lower()
        if provider in _PDF_OCR_PROVIDERS:
            return provider
        return "auto"

    def _should_try_unlimited_ocr(self, file_path: str, is_scanned: bool) -> bool:
        provider = self._get_pdf_ocr_provider()
        if provider == "liteparse":
            return False
        if provider == "auto" and not is_scanned:
            return False

        try:
            supported, reason = self.unlimited_ocr_service.supports_pdf(file_path)
        except Exception as exc:
            LOGGER.warning(
                "[DocumentsLoader] Unlimited-OCR eligibility check failed file=%s error=%s",
                file_path,
                exc,
            )
            return False

        if supported:
            return True

        LOGGER.info(
            "[DocumentsLoader] Skipping Unlimited-OCR file=%s provider=%s reason=%s",
            file_path,
            provider,
            reason,
        )
        return False

    def _log_pdf_parser_choice(
        self,
        file_path: str,
        parser_name: str,
        elapsed_seconds: float,
        is_scanned: bool,
    ) -> None:
        LOGGER.info(
            "[DocumentsLoader] PDF parser selected file=%s parser=%s is_scanned=%s elapsed=%.2fs",
            file_path,
            parser_name,
            is_scanned,
            elapsed_seconds,
        )

    def _parse_pdf_text(self, file_path: str, is_scanned: bool) -> str:
        started_at = time.monotonic()
        dpi = 300 if is_scanned else None

        if self._should_try_unlimited_ocr(file_path, is_scanned):
            try:
                text = self.unlimited_ocr_service.parse_pdf_to_markdown(file_path)
                self._log_pdf_parser_choice(
                    file_path,
                    "unlimited_ocr",
                    time.monotonic() - started_at,
                    is_scanned,
                )
                return text
            except Exception as exc:
                LOGGER.warning(
                    "[DocumentsLoader] Unlimited-OCR failed file=%s error=%s",
                    file_path,
                    exc,
                )

        text, parser_name = self._parse_with_liteparse_pipeline(file_path, dpi=dpi)
        self._log_pdf_parser_choice(
            file_path,
            parser_name,
            time.monotonic() - started_at,
            is_scanned,
        )
        return text

    async def load_text(self, file_path: str) -> str:
        with open(file_path, "r", encoding="utf-8") as file:
            return await asyncio.to_thread(file.read)

    @staticmethod
    def load_office_document(file_path: str) -> str:
        try:
            return extract_office_document_text(file_path)
        except OfficeDocumentError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    def load_image(self, file_path: str, temp_dir: Optional[str] = None) -> str:
        if temp_dir:
            converted_path = self.document_conversion_service.convert_image_to_png(
                file_path,
                temp_dir,
                timeout_seconds=self.DECOMPOSE_TIMEOUT_SECONDS,
            )
            return self._parse_with_liteparse(converted_path, dpi=300)

        with tempfile.TemporaryDirectory(prefix="image-convert-") as conversion_dir:
            converted_path = self.document_conversion_service.convert_image_to_png(
                file_path,
                conversion_dir,
                timeout_seconds=self.DECOMPOSE_TIMEOUT_SECONDS,
            )
            return self._parse_with_liteparse(converted_path, dpi=300)

    def _parse_with_liteparse_pipeline(
        self,
        file_path: str,
        dpi: int = None,
    ) -> Tuple[str, str]:
        try:
            LOGGER.info("[DocumentsLoader] LiteParse start file=%s", file_path)
            return (
                self.liteparse_service.parse_to_markdown(
                    file_path,
                    ocr_enabled=True,
                    ocr_language=self._ocr_language,
                    dpi=dpi,
                ),
                "liteparse",
            )
        except (LiteParseError, DocumentConversionError, OfficeDocumentError) as exc:
            LOGGER.warning(
                "[DocumentsLoader] Primary parse failed file=%s error=%s",
                file_path,
                exc,
            )
            if Path(file_path).suffix.lower() in PDF_EXTENSIONS:
                try:
                    LOGGER.info(
                        "[DocumentsLoader] Trying native PDF fallback file=%s",
                        file_path,
                    )
                    return self._parse_pdf_with_native_fallback(file_path), "native_fallback"
                except Exception:
                    LOGGER.exception(
                        "[DocumentsLoader] Native PDF fallback failed file=%s",
                        file_path,
                    )
            if self.document_service is not None:
                try:
                    LOGGER.info("[DocumentsLoader] Trying fallback parser file=%s", file_path)
                    return (
                        self.document_service.parse_to_markdown(file_path),
                        "document_service_fallback",
                    )
                except Exception:
                    LOGGER.exception(
                        "[DocumentsLoader] Fallback parser failed file=%s",
                        file_path,
                    )
            raise HTTPException(
                status_code=500,
                detail=f"Failed to parse document {os.path.basename(file_path)}: {exc}",
            ) from exc

    def _parse_with_liteparse(self, file_path: str, dpi: int = None) -> str:
        return self._parse_with_liteparse_pipeline(file_path, dpi=dpi)[0]

    @classmethod
    def get_page_images_from_pdf(cls, file_path: str, temp_dir: str) -> List[str]:
        with pdfplumber.open(file_path) as pdf:
            images = []
            for page in pdf.pages:
                img = page.to_image(resolution=150)
                image_path = os.path.join(temp_dir, f"page_{page.page_number}.png")
                img.save(image_path)
                images.append(image_path)
            return images

    @classmethod
    async def get_page_images_from_pdf_async(cls, file_path: str, temp_dir: str):
        return await asyncio.to_thread(
            cls.get_page_images_from_pdf, file_path, temp_dir
        )
