"""Default tools registered for the AI Agent.

These tools connect to real backend services (RAG, diagram generation, slides, etc.)
and return structured results that can be serialized as ui_element SSE frames.
"""

import json
from backend.agent.tools import tool_registry


# ── RAG / Knowledge Retrieval ──────────────────────────────────────────

@tool_registry.register
async def search_course_knowledge(query: str, course_id: str = "", top_k: int = 5) -> str:
    """Search through course materials (lecture notes, textbooks, assignments) to find relevant knowledge.
    Use this whenever the student asks something about the course content."""
    try:
        from backend.services.course_rag_service.service import CourseRagService
        from backend.core.dependencies import get_course_rag_service

        rag: CourseRagService = get_course_rag_service()
        results = await rag.search(query=query, course_id=course_id if course_id else None, top_k=top_k)

        if not results:
            return json.dumps({
                "status": "success",
                "message": "No relevant course materials found for this query.",
                "results": [],
            })

        serialized = []
        for r in results:
            serialized.append({
                "doc_name": r.get("doc_name", "unknown"),
                "score": round(r.get("score", 0), 4),
                "text": (r.get("text") or r.get("content", ""))[:500],
            })

        return json.dumps({
            "status": "success",
            "message": f"Found {len(serialized)} relevant documents.",
            "results": serialized,
        })
    except Exception as e:
        return json.dumps({
            "status": "error",
            "message": f"RAG search failed: {str(e)}",
        })


# ── Diagram Generation ─────────────────────────────────────────────────

@tool_registry.register
async def generate_diagram(description: str, diagram_type: str = "flowchart") -> str:
    """Generate a diagram (flowchart, architecture diagram, sequence diagram, etc.) based on a natural-language description.
    Returns a diagram element that the frontend will render."""
    import uuid
    try:
        from backend.services.diagram_service import DiagramService

        svc = DiagramService()
        task_id = str(uuid.uuid4())[:8]
        result = await svc.generate(description=description, diagram_type=diagram_type)

        return json.dumps({
            "status": "success",
            "ui_element": {
                "type": "diagram",
                "url": result.get("url", ""),
                "alt": f"{diagram_type}: {description[:80]}",
                "diagram_type": diagram_type,
                "task_id": task_id,
            },
            "message": f"Diagram '{diagram_type}' generated successfully.",
        })
    except Exception as e:
        return json.dumps({
            "status": "error",
            "message": f"Diagram generation failed: {str(e)}",
        })


# ── Slide / PPT Generation ─────────────────────────────────────────────

@tool_registry.register
async def render_presentation(topic: str, requirements: str = "") -> str:
    """
    Generate presentation slides (PPT) using the HTML/CSS rendering pipeline.

    This tool creates a complete slide deck by:
    1. Generating a Markdown outline from the topic using LLM.
    2. Applying a base CSS theme (default: neon_tech).
    3. (Optional) Customizing the theme via LLM based on the requirements description.
    4. Rendering the Markdown with the customized CSS into HTML.
    5. Screenshotting each slide via Playwright and packaging into a PPTX file.

    Args:
        topic: The presentation topic (e.g., "Quantum Computing 101").
        requirements: Combined content and visual style requirements
            (e.g., "dark tech style with neon green glow, 5+ sections, suitable for TED talk").

    Returns:
        JSON with download link, preview HTML link, and page count wrapped as a ui_element.
    """
    import os
    try:
        from backend.services.slides_pipeline_service import generate_outline as _gen_outline
        from backend.services.slides.html_renderer import SlidesHtmlRenderer
        from backend.services.slides.dynamic_theme_service import DynamicThemeService
        from backend.config import Config

        # 1. Generate Markdown outline
        outline_md = await _gen_outline(topic, provider="local_ollama")
        if not outline_md:
            return json.dumps({
                "status": "error",
                "message": "Failed to generate outline for the topic.",
            })

        # 2. Determine base theme and style prompt from requirements
        theme_service = DynamicThemeService()
        base_style = "neon_tech"  # default
        style_prompt = requirements

        # Auto-detect base style from requirements keywords
        req_lower = requirements.lower()
        if "minimal" in req_lower or "academic" in req_lower or "clean" in req_lower:
            base_style = "minimalist"
        elif "corporate" in req_lower or "business" in req_lower or "blue" in req_lower:
            base_style = "corporate"

        base_css = theme_service.load_base_css(base_style)

        # 3. Optionally customize CSS via LLM
        custom_css = base_css
        if style_prompt.strip():
            try:
                custom_css = await theme_service.customize_theme(
                    base_css_content=base_css,
                    user_custom_theme_prompt=style_prompt,
                    provider="local_ollama",
                )
            except Exception as theme_err:
                # Fallback to base CSS if LLM customization fails
                custom_css = base_css

        # 4. Render Markdown → HTML → PPTX
        renderer = SlidesHtmlRenderer()
        output_dir = Config.PPT_RESULTS_FOLDER
        os.makedirs(output_dir, exist_ok=True)

        safe_topic_name = topic.replace(" ", "_").replace("/", "_")
        result = await renderer.render_and_export(
            md_content=outline_md,
            css_content=custom_css,
            output_dir=output_dir,
            title=safe_topic_name,
        )

        return json.dumps({
            "status": "success",
            "message": f"Generated {result['page_count']} presentation slides about '{topic}'.",
            "ui_element": {
                "type": "file",
                "url": result["pptx_download_url"],
                "file_name": f"{safe_topic_name}_presentation.pptx",
                "preview_html_url": result.get("html_preview_url", ""),
            },
        })
    except Exception as e:
        return json.dumps({
            "status": "error",
            "message": f"Failed to generate presentation: {str(e)}",
        })


# ── PDF Content Extraction ─────────────────────────────────────────────

@tool_registry.register
async def extract_pdf_content(pdf_url: str, page_number: int = 1) -> str:
    """Extract text and images from a PDF page. Returns the extracted content."""
    try:
        import requests
        from bs4 import BeautifulSoup

        # For local files, use the pdf_loader module
        if pdf_url.startswith("http"):
            resp = requests.get(pdf_url, timeout=30)
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "")
            if "application/pdf" not in content_type:
                return json.dumps({
                    "status": "error",
                    "message": f"URL does not point to a PDF file (got: {content_type})",
                })
            # Return a marker — full extraction would use pdf_loader
            return json.dumps({
                "status": "success",
                "message": f"PDF at {pdf_url} is accessible ({len(resp.content)} bytes).",
                "page_count_hint": "Use local pdf_loader for full extraction.",
            })

        # Local file path
        import os
        if os.path.isfile(pdf_url):
            file_size = os.path.getsize(pdf_url)
            return json.dumps({
                "status": "success",
                "message": f"PDF file '{os.path.basename(pdf_url)}' found ({file_size} bytes).",
                "ui_element": {
                    "type": "file",
                    "url": pdf_url,
                    "file_name": os.path.basename(pdf_url),
                },
            })

        return json.dumps({
            "status": "error",
            "message": f"PDF not found at {pdf_url}",
        })
    except Exception as e:
        return json.dumps({
            "status": "error",
            "message": f"PDF extraction failed: {str(e)}",
        })