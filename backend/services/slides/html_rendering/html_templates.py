from __future__ import annotations

from jinja2 import Environment, FileSystemLoader, select_autoescape

from .constants import SLIDE_TEMPLATE, TEMPLATE_DIR


def build_jinja_env() -> Environment:
    return Environment(
        loader=FileSystemLoader(TEMPLATE_DIR),
        autoescape=select_autoescape(["html", "xml"]),
    )


def heading_html_escape(value: str) -> str:
    return (
        str(value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def render_html_impl(
    *,
    slides: list[dict],
    css_content: str,
    title: str,
    theme_draft_to_render_slides_fn,
    build_jinja_env_fn,
    heading_html_escape_fn,
) -> str:
    env = build_jinja_env_fn()
    template = env.get_template(SLIDE_TEMPLATE)

    enriched_slides = []
    for index, slide in enumerate(theme_draft_to_render_slides_fn(slides)):
        tag = "h1" if index == 0 or slide["layout"] == "cover" else "h2"
        heading_html = (
            f'<{tag} class="slide-heading">{heading_html_escape_fn(slide["heading"])}</{tag}>'
            if slide["heading"]
            else ""
        )

        body_html_parts: list[str] = []
        if slide["body"]:
            body_html_parts.append(
                "".join(
                    f"<p>{heading_html_escape_fn(line)}</p>"
                    for line in slide["body"].split("\n")
                    if line.strip()
                )
            )
        bullets_html = ""
        if slide["bullets"]:
            bullets_html = "<ul>" + "".join(
                f"<li>{heading_html_escape_fn(item)}</li>" for item in slide["bullets"]
            ) + "</ul>"

        accent_html = ""
        if slide["accent_text"]:
            accent_html = (
                f'<div class="theme-draft-accent">{heading_html_escape_fn(slide["accent_text"])}</div>'
            )

        if slide["layout"] == "split":
            side_html = bullets_html or '<div class="theme-draft-placeholder"></div>'
            content_html = (
                f'<div class="theme-draft split align-{slide["align"]}">'
                f'<div class="theme-draft-main">{heading_html}{accent_html}{"".join(body_html_parts) or "<p></p>"}</div>'
                f'<div class="theme-draft-side">{side_html}</div>'
                f"</div>"
            )
        elif slide["layout"] == "quote":
            quote_text = slide["body"] or "Add your key message here."
            content_html = (
                f'<div class="theme-draft quote align-{slide["align"]}">'
                f"{heading_html}"
                f'<blockquote class="theme-draft-quote">{heading_html_escape_fn(quote_text)}</blockquote>'
                f"{accent_html}"
                f"</div>"
            )
        else:
            content_html = (
                f'<div class="theme-draft {slide["layout"]} align-{slide["align"]}">'
                f"{heading_html}"
                f"{accent_html}"
                f'{"".join(body_html_parts)}'
                f"{bullets_html}"
                f"</div>"
            )

        enriched_slides.append(
            {
                "content_html": content_html,
                "heading": slide["heading"],
                "layout": slide["layout"],
            }
        )

    return template.render(
        css_content=css_content,
        slides=enriched_slides,
        title=title,
    )
