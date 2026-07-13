from __future__ import annotations

from io import BytesIO


def render_zoomable_preview(*, slide_pngs: list[bytes], zoom: float, offset_x: int, offset_y: int, tile_size: int):
    if not slide_pngs:
        return None
    try:
        from PIL import Image

        slide_images: list[Image.Image] = [Image.open(BytesIO(png_bytes)) for png_bytes in slide_pngs]
        if not slide_images:
            return None
        cols = min(3, len(slide_images))
        rows = (len(slide_images) + cols - 1) // cols
        slide_w, slide_h = slide_images[0].size
        gap = 20
        canvas_w = cols * slide_w + (cols + 1) * gap
        canvas_h = rows * slide_h + (rows + 1) * gap
        canvas = Image.new("RGBA", (canvas_w, canvas_h), (240, 240, 240, 255))
        for index, image in enumerate(slide_images):
            row = index // cols
            col = index % cols
            x = gap + col * (slide_w + gap)
            y = gap + row * (slide_h + gap)
            canvas.paste(image, (x, y))
        if zoom != 1.0:
            canvas = canvas.resize((max(1, int(canvas_w * zoom)), max(1, int(canvas_h * zoom))), Image.LANCZOS)
        if offset_x != 0 or offset_y != 0:
            crop_box = (
                max(0, offset_x),
                max(0, offset_y),
                min(canvas.width, offset_x + int(tile_size * zoom)),
                min(canvas.height, offset_y + int(tile_size * zoom)),
            )
            if crop_box[2] > crop_box[0] and crop_box[3] > crop_box[1]:
                canvas = canvas.crop(crop_box)
        buffer = BytesIO()
        canvas.save(buffer, format="PNG")
        buffer.seek(0)
        return buffer.read()
    except Exception:
        return None
