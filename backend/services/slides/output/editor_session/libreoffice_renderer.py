from __future__ import annotations

import logging
import os
import shutil
import subprocess
import sys

from .rendering import render_slides_via_pillow

logger = logging.getLogger(__name__)


def find_soffice(session_cls) -> str | None:
    if session_cls.SOFFICE_BIN is not None:
        return session_cls.SOFFICE_BIN
    which = shutil.which("soffice")
    if which:
        session_cls.SOFFICE_BIN = which
        return which
    if sys.platform == "darwin":
        mac_path = "/Applications/LibreOffice.app/Contents/MacOS/soffice"
        if os.path.isfile(mac_path):
            session_cls.SOFFICE_BIN = mac_path
    return session_cls.SOFFICE_BIN


def ensure_soffice(session_cls) -> None:
    if find_soffice(session_cls) is None:
        raise RuntimeError(
            "LibreOffice (soffice) not found on PATH. Slides preview requires LibreOffice for high-fidelity rendering."
        )


def render_pptx_to_pngs(session) -> None:
    soffice = find_soffice(type(session))
    if soffice:
        try:
            render_via_libreoffice(session, soffice)
            return
        except Exception as exc:
            logger.warning("LibreOffice render failed, falling back to Pillow: %s", exc)
    logger.info("LibreOffice not available; using Pillow fallback for slide previews")
    render_via_pillow(session)


def render_via_libreoffice(session, soffice: str) -> None:
    import fitz

    os.makedirs(session.output_dir, exist_ok=True)
    pptx_path = os.path.join(session.output_dir, session.original_name)
    with open(pptx_path, "wb") as handle:
        handle.write(session._pptx_bytes)

    pdf_path = os.path.splitext(pptx_path)[0] + ".pdf"
    env = os.environ.copy()
    env["HOME"] = session.output_dir
    cmd = [
        soffice,
        "--headless",
        "--norestore",
        "--nofirststartwizard",
        "--convert-to",
        "pdf",
        "--outdir",
        session.output_dir,
        pptx_path,
    ]
    try:
        subprocess.run(cmd, env=env, capture_output=True, timeout=60, check=True)
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or b"").decode("utf-8", errors="replace")
        raise RuntimeError(f"LibreOffice PDF conversion failed: {stderr}") from exc
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF not created by LibreOffice at {pdf_path}")

    document = fitz.open(pdf_path)
    slide_pngs: list[bytes] = []
    for page_num in range(len(document)):
        page = document.load_page(page_num)
        pixmap = page.get_pixmap(matrix=fitz.Matrix(150 / 72, 150 / 72))
        slide_pngs.append(pixmap.tobytes("png"))
    document.close()
    session._slide_pngs = slide_pngs
    session.slide_count = len(slide_pngs)


def render_via_pillow(session) -> None:
    session._slide_pngs = render_slides_via_pillow(session._pptx_bytes)
    session.slide_count = len(session._slide_pngs)
