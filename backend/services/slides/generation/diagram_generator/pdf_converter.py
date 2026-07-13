from __future__ import annotations

from typing import Optional

from pdf2image import convert_from_path


def convert_pdf_to_image(pdf_path: str, *, dpi: int = 300, ratio: int = 0) -> Optional[str]:
    try:
        from PIL import Image

        image_path = pdf_path.replace(".pdf", ".png")
        images = convert_from_path(pdf_path, dpi=dpi)
        if not images:
            print("PDF conversion failed: no images generated")
            return None
        image = images[0]
        target_size = (1280, 720) if ratio == 1 else (960, 720)
        image = image.resize(target_size, Image.LANCZOS)
        image.save(image_path, "PNG")
        return image_path
    except Exception as exc:
        print(f"PDF to image conversion failed: {exc}")
        return None
