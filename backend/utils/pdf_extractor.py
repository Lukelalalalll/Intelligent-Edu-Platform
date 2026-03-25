from pathlib import Path
import pdfplumber


def extract_text_from_pdf(pdf_path: str | Path) -> str:
    """Extract text content from a PDF file.

    Returns an empty string if the file cannot be read.
    """
    path = Path(pdf_path)
    if not path.exists():
        return ""

    text_parts: list[str] = []
    try:
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                text_parts.append(page.extract_text() or "")
    except Exception:
        return ""

    return "\n".join(text_parts)
