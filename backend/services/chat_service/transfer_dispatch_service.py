"""
Transfer Dispatch Service — Routes chat file attachments to sub1-sub5 modules.

Each target module has its own adapter that handles file format differences.
"""

import hashlib
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from backend.config import Config
from backend.core.database import db
from backend.repositories._helpers import coerce_object_id, utcnow

logger = logging.getLogger(__name__)

CHAT_FILES_DIR = os.path.join(Config.BASE_DIR, "static", "chat_files")

# Allowed extensions per target module
MODULE_ALLOWED_EXTENSIONS: dict[str, set[str]] = {
    "sub1": {"pdf", "md"},
    "sub2": {"pdf", "png", "jpg", "jpeg"},
    "sub3": {"pdf"},
    "sub4": {"pdf", "docx", "doc"},
    "sub5": {"pdf"},
}

TRANSFER_TICKET_TTL_HOURS = int(os.getenv("CHAT_TRANSFER_TICKET_TTL_HOURS", "24"))


def _compute_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _resolve_file_path(file_url: str) -> str:
    """Resolve a /static/chat_files/... URL to an absolute path safely."""
    if not file_url:
        raise ValueError("Empty file URL")

    # Strip leading slash for path join
    relative = file_url.lstrip("/")

    # Security: ensure it stays within static/chat_files
    abs_path = os.path.normpath(os.path.join(Config.BASE_DIR, relative))
    safe_prefix = os.path.normpath(CHAT_FILES_DIR)
    if not abs_path.startswith(safe_prefix):
        raise ValueError("File path traversal detected")

    if not os.path.isfile(abs_path):
        raise FileNotFoundError(f"Source file not found: {abs_path}")

    return abs_path


def _get_extension(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def _ext_from_mime(mime_type: str) -> str:
    mime = str(mime_type or "").lower()
    if "pdf" in mime:
        return "pdf"
    if "markdown" in mime:
        return "md"
    if "png" in mime:
        return "png"
    if "jpeg" in mime or "jpg" in mime:
        return "jpg"
    if "webp" in mime:
        return "webp"
    if "gif" in mime:
        return "gif"
    if "wordprocessingml" in mime:
        return "docx"
    if "msword" in mime:
        return "doc"
    if "presentationml" in mime:
        return "pptx"
    if "spreadsheetml" in mime:
        return "xlsx"
    if "zip" in mime:
        return "zip"
    return ""


def _resolve_message_extension(file_name: str, file_url: str, mime_type: str) -> str:
    ext = _get_extension(file_name)
    if ext:
        return ext
    ext = _get_extension(str(file_url or "").split("?")[0].split("#")[0])
    if ext:
        return ext
    return _ext_from_mime(mime_type)


def _as_aware_utc(value: datetime | None) -> datetime | None:
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


async def create_transfer(
    room_id: str,
    message_id: str,
    owner_user_id: str,
    target_module: str,
    target_options: Optional[dict] = None,
) -> dict:
    """Create a transfer ticket from a chat file message to a target module."""
    # Validate target
    if target_module not in MODULE_ALLOWED_EXTENSIONS:
        raise ValueError(f"Invalid target module: {target_module}")

    # Fetch the message to get file info
    # message_id must be a valid ObjectId (optimistic client IDs are not persisted yet)
    if str(message_id).startswith("optimistic-"):
        raise ValueError("Message is still syncing. Please retry transfer in a moment.")

    # message_id must be a valid ObjectId
    message_oid = coerce_object_id(message_id)
    if message_oid is None:
        raise ValueError(f"Invalid message_id: {message_id}")
    msg = await db.chat_messages.find_one({"_id": message_oid})

    if not msg:
        raise ValueError("Source message not found")

    if msg.get("roomId") != room_id:
        raise ValueError("Message does not belong to this room")

    file_url = msg.get("fileUrl")
    file_name = msg.get("fileName", "unknown")
    file_size = msg.get("fileSize", 0)
    mime_type = msg.get("mimeType", "application/octet-stream")

    if not file_url:
        raise ValueError("Message does not contain a file attachment")

    # Validate extension for target
    ext = _resolve_message_extension(file_name, file_url, mime_type)
    allowed = MODULE_ALLOWED_EXTENSIONS.get(target_module, set())
    if ext not in allowed:
        raise ValueError(
            f"File type .{ext} is not supported by {target_module}. "
            f"Allowed: {', '.join(sorted(allowed))}"
        )

    # Resolve and hash the file
    abs_path = _resolve_file_path(file_url)
    with open(abs_path, "rb") as f:
        file_data = f.read()
    sha256 = _compute_sha256(file_data)

    now = utcnow()
    transfer_id = uuid.uuid4().hex

    transfer_doc = {
        "transfer_id": transfer_id,
        "source_room_id": room_id,
        "source_message_id": message_id,
        "source_file_url": file_url,
        "owner_user_id": owner_user_id,
        "file_meta": {
            "name": file_name,
            "ext": ext,
            "size": file_size,
            "mime": mime_type,
            "sha256": sha256,
        },
        "target_module": target_module,
        "target_options": target_options or {},
        "status": "created",
        "created_at": now,
        "consumed_at": None,
        "expires_at": now + timedelta(hours=TRANSFER_TICKET_TTL_HOURS),
        "error_message": "",
    }

    await db.chat_file_transfers.insert_one(transfer_doc)

    # Build redirect URL
    redirect_map = {
        "sub1": "/slides/md-processor",
        "sub2": "/questions",
        "sub3": "/image-extractor",
        "sub4": "/diagram",
        "sub5": "/study-notes",
    }
    redirect_url = f"{redirect_map.get(target_module, '/')}?transfer_id={transfer_id}"

    return {
        "transfer_id": transfer_id,
        "status": "created",
        "redirect_url": redirect_url,
        "target_module": target_module,
    }


async def get_transfer(transfer_id: str, user_id: str) -> Optional[dict]:
    """Get transfer ticket status. Only owner can view."""
    doc = await db.chat_file_transfers.find_one({"transfer_id": transfer_id})
    if not doc:
        return None
    if doc.get("owner_user_id") != user_id:
        return None

    doc.pop("_id", None)
    return doc


async def consume_transfer(transfer_id: str, user_id: str) -> dict:
    """Consume a transfer ticket — return file info so the frontend can download and re-upload."""
    doc = await db.chat_file_transfers.find_one({"transfer_id": transfer_id})
    if not doc:
        raise ValueError("Transfer ticket not found")
    if doc.get("owner_user_id") != user_id:
        raise PermissionError("Not authorized to consume this transfer")

    status = doc.get("status", "")
    if status == "consumed":
        # Idempotent: return existing result
        return {
            "transfer_id": transfer_id,
            "status": "consumed",
            "file_meta": doc.get("file_meta", {}),
            "source_file_url": doc.get("source_file_url", ""),
            "target_module": doc.get("target_module", ""),
            "target_options": doc.get("target_options", {}),
        }
    if status == "expired":
        raise ValueError("Transfer ticket has expired")
    if status not in ("created", "failed"):
        raise ValueError(f"Transfer ticket is in status '{status}', cannot consume")

    # Check expiration
    now = utcnow()
    expires_at = _as_aware_utc(doc.get("expires_at"))
    if expires_at:
        if now > expires_at:
            await db.chat_file_transfers.update_one(
                {"transfer_id": transfer_id},
                {"$set": {"status": "expired"}},
            )
            raise ValueError("Transfer ticket has expired")

    # Verify the source file still exists
    file_url = doc["source_file_url"]
    try:
        _resolve_file_path(file_url)
    except (FileNotFoundError, ValueError) as exc:
        await db.chat_file_transfers.update_one(
            {"transfer_id": transfer_id},
            {"$set": {"status": "failed", "error_message": str(exc)[:500]}},
        )
        raise ValueError(f"Source file no longer available: {exc}")

    # Mark as consumed
    await db.chat_file_transfers.update_one(
        {"transfer_id": transfer_id},
        {"$set": {
            "status": "consumed",
            "consumed_at": utcnow(),
        }},
    )

    return {
        "transfer_id": transfer_id,
        "status": "consumed",
        "file_meta": doc.get("file_meta", {}),
        "source_file_url": file_url,
        "target_module": doc.get("target_module", ""),
        "target_options": doc.get("target_options", {}),
    }


async def retry_transfer(transfer_id: str, user_id: str) -> dict:
    """Retry a failed transfer."""
    doc = await db.chat_file_transfers.find_one({"transfer_id": transfer_id})
    if not doc:
        raise ValueError("Transfer ticket not found")
    if doc.get("owner_user_id") != user_id:
        raise PermissionError("Not authorized")
    if doc.get("status") != "failed":
        raise ValueError("Can only retry failed transfers")

    # Reset to created and re-consume
    await db.chat_file_transfers.update_one(
        {"transfer_id": transfer_id},
        {"$set": {"status": "created", "error_message": ""}},
    )
    return await consume_transfer(transfer_id, user_id)


# ──────────────────────────────────────────────────────────────
# Module Adapters
# ──────────────────────────────────────────────────────────────

async def _dispatch_sub1(abs_path: str, file_name: str, options: dict) -> dict:
    """Adapter for sub1 (slides): parse-md logic."""
    from backend.services.slides import MarkdownViewer as MDParser
    from backend.services.slides.parsing.pdf2md import convert_pdf_to_md
    import tempfile

    ext = _get_extension(file_name)

    if ext == "pdf":
        with tempfile.NamedTemporaryFile(suffix=".md", delete=False) as tmp_md:
            md_path = tmp_md.name
        try:
            convert_pdf_to_md(abs_path, md_path)
            parsing_path = md_path
        except Exception:
            os.unlink(md_path)
            raise
    else:
        parsing_path = abs_path

    try:
        parser = MDParser()
        parser.load_file(parsing_path, options.get("use_llm", False))
        headers = [
            {"index": i + 1, "level": s["header"]["level"], "text": s["header"]["text"]}
            for i, s in enumerate(parser.header_sections)
        ]
    finally:
        if ext == "pdf":
            os.unlink(parsing_path)

    return {
        "filename": file_name,
        "headers": headers,
        "use_llm": options.get("use_llm", False),
    }


async def _dispatch_sub2(abs_path: str, file_name: str, options: dict) -> dict:
    """Adapter for sub2 (questions): upload + extract logic."""
    from backend.services.questions import save_upload

    ext = _get_extension(file_name)
    with open(abs_path, "rb") as f:
        content = f.read()

    result = save_upload(file_name, content, ext)
    return {
        "task_id": result.get("task_id", ""),
        "filename": file_name,
        "file_type": ext,
        "total_pages": result.get("total_pages", 0),
    }


async def _dispatch_sub3(abs_path: str, file_name: str, options: dict) -> dict:
    """Adapter for sub3 (image-extractor): extract-pdf-images logic."""
    from backend.services.visual.image_extractor_service import extract_images_from_pdf

    result = extract_images_from_pdf(abs_path)
    return {
        "totalImages": result.get("totalImages", 0),
        "imagesByChapter": result.get("imagesByChapter", {}),
    }


async def _dispatch_sub4(abs_path: str, file_name: str, options: dict) -> dict:
    """Adapter for sub4 (diagram): upload_document logic."""
    from backend.services.visual.diagram_extractor_service import extract_diagrams_from_file

    result = extract_diagrams_from_file(abs_path, file_name)
    return {
        "extracted": result.get("extracted", []),
        "extracted_count": result.get("extracted_count", 0),
    }


async def _dispatch_sub5(abs_path: str, file_name: str, options: dict) -> dict:
    """Adapter for sub5 (study-notes): generate-notes logic."""
    ext = _get_extension(file_name)
    if ext != "pdf":
        raise ValueError("Study notes only supports PDF files")

    with open(abs_path, "rb") as f:
        content = f.read()

    # Use the study notes service to extract text and generate notes
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Extract text from PDF
        import fitz
        doc = fitz.open(tmp_path)
        text = ""
        for page in doc:
            text += page.get_text()
        doc.close()
    finally:
        os.unlink(tmp_path)

    if len(text.strip()) < 50:
        raise ValueError("PDF contains too little text to generate notes")

    style = options.get("style", "detailed")
    file_id = uuid.uuid4().hex

    return {
        "source_text": text[:15000],
        "source_chars": len(text),
        "file_id": file_id,
        "style": style,
        "filename": file_name,
    }


_ADAPTERS = {
    "sub1": _dispatch_sub1,
    "sub2": _dispatch_sub2,
    "sub3": _dispatch_sub3,
    "sub4": _dispatch_sub4,
    "sub5": _dispatch_sub5,
}
