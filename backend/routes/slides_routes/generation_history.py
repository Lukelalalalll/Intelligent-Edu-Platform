from __future__ import annotations


def build_generate_render_source(req) -> dict:
    source_kind = (req.source_kind or "").strip() or "text"
    source_filename = str(req.source_filename or "").strip()
    source_display_name = str(req.source_display_name or "").strip()
    combined_filename = str(req.combined_markdown_filename or "").strip()
    source: dict[str, str] = {
        "kind": source_kind,
        "title": req.title,
    }
    if source_filename:
        source["source_filename"] = source_filename
        source["source_download_url"] = f"/api/slides/download_source/{source_filename}"
    if source_display_name:
        source["source_display_name"] = source_display_name
    if combined_filename:
        source["combined_markdown_filename"] = combined_filename
        source["combined_markdown_download_url"] = f"/api/slides/download/{combined_filename}"
    return source


def build_generate_render_result_metadata(req, result: dict, request_id: str) -> dict:
    pptx_download_url = str(result.get("pptx_download_url") or "").strip()
    html_preview_url = str(result.get("html_preview_url") or "").strip()
    pptx_filename = pptx_download_url.rsplit("/", 1)[-1] if pptx_download_url else ""
    html_filename = html_preview_url.rsplit("/", 1)[-1] if html_preview_url else ""
    return {
        "request_id": request_id,
        "title": req.title,
        "page_count": result.get("page_count"),
        "pptx_filename": pptx_filename,
        "pptx_download_url": pptx_download_url,
        "html_preview_filename": html_filename,
        "html_preview_url": html_preview_url,
    }
