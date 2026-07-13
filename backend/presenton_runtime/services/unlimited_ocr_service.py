from __future__ import annotations

import base64
import json
import os
import tempfile
from pathlib import Path
from typing import Any
from urllib import error, request


class UnlimitedOCRServiceError(RuntimeError):
    """Base error for Unlimited-OCR integration failures."""


class UnlimitedOCRUnavailable(UnlimitedOCRServiceError):
    """Raised when Unlimited-OCR is disabled or unavailable."""


class UnlimitedOCRParseError(UnlimitedOCRServiceError):
    """Raised when Unlimited-OCR returns an invalid or unusable payload."""


def _env_bool(name: str, default: bool) -> bool:
    raw = (os.getenv(name) or "").strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        parsed = int(raw)
    except ValueError:
        return default
    return min(max(parsed, minimum), maximum)


def _normalize_openai_compatible_base_url(url: str) -> str:
    normalized = (url or "").strip().rstrip("/")
    if not normalized:
        return normalized
    if normalized.endswith("/v1"):
        return normalized
    if "/v1" in normalized.split("?", 1)[0]:
        return normalized
    return f"{normalized}/v1"


class UnlimitedOCRService:
    DEFAULT_BASE_URL = "http://127.0.0.1:10000"
    DEFAULT_MODEL = "Unlimited-OCR"
    DEFAULT_DPI = 300
    DEFAULT_MAX_PAGES = 32
    DEFAULT_PROMPT = "Multi page parsing."

    def __init__(self, timeout_seconds: int = 1200):
        self.enabled = _env_bool("UNLIMITED_OCR_ENABLED", default=False)
        self.base_url = _normalize_openai_compatible_base_url(
            os.getenv("UNLIMITED_OCR_BASE_URL", self.DEFAULT_BASE_URL)
        )
        self.model = (os.getenv("UNLIMITED_OCR_MODEL") or self.DEFAULT_MODEL).strip()
        self.dpi = _env_int("UNLIMITED_OCR_DPI", self.DEFAULT_DPI, minimum=72, maximum=600)
        self.max_pages = _env_int(
            "UNLIMITED_OCR_MAX_PAGES",
            self.DEFAULT_MAX_PAGES,
            minimum=1,
            maximum=512,
        )
        self.timeout_seconds = _env_int(
            "UNLIMITED_OCR_TIMEOUT_SECONDS",
            timeout_seconds,
            minimum=30,
            maximum=3600,
        )
        self.api_key = (os.getenv("UNLIMITED_OCR_API_KEY") or "").strip()

    def is_enabled(self) -> bool:
        return self.enabled

    def supports_pdf(self, file_path: str) -> tuple[bool, str]:
        if not self.enabled:
            return False, "Unlimited-OCR is disabled"
        if not self.base_url:
            return False, "Unlimited-OCR base URL is not configured"
        if not self.model:
            return False, "Unlimited-OCR model is not configured"

        page_count = self.get_pdf_page_count(file_path)
        if page_count > self.max_pages:
            return (
                False,
                f"PDF has {page_count} pages which exceeds UNLIMITED_OCR_MAX_PAGES={self.max_pages}",
            )
        return True, "ok"

    def get_pdf_page_count(self, file_path: str) -> int:
        import fitz

        with fitz.open(file_path) as doc:
            return int(doc.page_count)

    def parse_pdf_to_markdown(self, file_path: str) -> str:
        supported, reason = self.supports_pdf(file_path)
        if not supported:
            raise UnlimitedOCRUnavailable(reason)

        image_paths = self._render_pdf_to_images(file_path)
        try:
            payload = self._build_payload(image_paths)
            response = self._send_request(payload)
            text = self._extract_text(response)
        finally:
            self._cleanup_images(image_paths)

        if not text.strip():
            raise UnlimitedOCRParseError("Unlimited-OCR returned empty content")
        return text

    def _render_pdf_to_images(self, file_path: str) -> list[str]:
        import fitz

        image_dir = tempfile.mkdtemp(prefix="unlimited-ocr-pages-")
        image_paths: list[str] = []
        zoom = self.dpi / 72
        matrix = fitz.Matrix(zoom, zoom)
        with fitz.open(file_path) as doc:
            for index, page in enumerate(doc):
                image_path = os.path.join(image_dir, f"page_{index + 1:04d}.png")
                page.get_pixmap(matrix=matrix).save(image_path)
                image_paths.append(image_path)
        return image_paths

    def _cleanup_images(self, image_paths: list[str]) -> None:
        parent_dirs = {str(Path(path).parent) for path in image_paths}
        for image_path in image_paths:
            try:
                Path(image_path).unlink(missing_ok=True)
            except OSError:
                pass
        for parent_dir in parent_dirs:
            try:
                Path(parent_dir).rmdir()
            except OSError:
                pass

    def _build_payload(self, image_paths: list[str]) -> dict[str, Any]:
        return {
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": self.DEFAULT_PROMPT},
                        *[self._encode_image(path) for path in image_paths],
                    ],
                }
            ],
            "temperature": 0,
            "stream": False,
            "skip_special_tokens": False,
            "images_config": {"image_mode": "base"},
        }

    def _encode_image(self, image_path: str) -> dict[str, Any]:
        suffix = Path(image_path).suffix.lower()
        mime = "image/jpeg" if suffix in {".jpg", ".jpeg"} else f"image/{suffix.lstrip('.')}"
        encoded = base64.b64encode(Path(image_path).read_bytes()).decode("ascii")
        return {
            "type": "image_url",
            "image_url": {"url": f"data:{mime};base64,{encoded}"},
        }

    def _send_request(self, payload: dict[str, Any]) -> dict[str, Any]:
        endpoint = f"{self.base_url.rstrip('/')}/chat/completions"
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        body = json.dumps(payload).encode("utf-8")
        req = request.Request(endpoint, data=body, headers=headers, method="POST")
        try:
            with request.urlopen(req, timeout=self.timeout_seconds) as response:
                raw = response.read().decode("utf-8", errors="replace")
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise UnlimitedOCRUnavailable(
                f"Unlimited-OCR HTTP {exc.code}: {detail or exc.reason}"
            ) from exc
        except error.URLError as exc:
            raise UnlimitedOCRUnavailable(
                f"Unlimited-OCR request failed: {exc.reason}"
            ) from exc

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise UnlimitedOCRParseError("Unlimited-OCR returned invalid JSON") from exc
        if not isinstance(parsed, dict):
            raise UnlimitedOCRParseError("Unlimited-OCR returned an unexpected payload")
        return parsed

    def _extract_text(self, payload: dict[str, Any]) -> str:
        choices = payload.get("choices")
        if not isinstance(choices, list) or not choices:
            raise UnlimitedOCRParseError("Unlimited-OCR returned no choices")

        message = choices[0].get("message")
        if not isinstance(message, dict):
            raise UnlimitedOCRParseError("Unlimited-OCR returned no message payload")

        content = message.get("content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                if isinstance(item, str):
                    parts.append(item)
                    continue
                if not isinstance(item, dict):
                    continue
                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text)
            return "".join(parts)
        raise UnlimitedOCRParseError("Unlimited-OCR returned an unsupported content shape")
