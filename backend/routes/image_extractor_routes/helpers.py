"""Private helper functions for image extraction."""
import hashlib
import io
import re
import unicodedata

from PIL import Image


def slugify(text: str, fallback: str = "image") -> str:
    if not text:
        return fallback
    text = unicodedata.normalize("NFKD", text)
    text = re.sub(r"[^\w\s-]", "", text, flags=re.UNICODE)
    text = re.sub(r"[\s_-]+", "_", text).strip("_")
    return text[:60] or fallback


def img_md5(img: Image.Image) -> str:
    try:
        return hashlib.md5(img.tobytes()).hexdigest()
    except Exception:
        return hashlib.md5(img.copy().tobytes()).hexdigest()


def collect_image_nodes(node, results):
    """Recursively collect all image items from opendataloader_pdf JSON output."""
    if str(node.get("type", "")).lower() == "image":
        results.append(node)
    for child in node.get("kids", []):
        collect_image_nodes(child, results)


def extract_images_opendataloader(data: bytes):
    """Primary: use opendataloader_pdf (fast Java-based extraction)."""
    import glob
    import json
    import os
    import shutil
    import tempfile

    import opendataloader_pdf

    tmp_dir = tempfile.mkdtemp(prefix="sub3_pdf_")
    try:
        img_dir = os.path.join(tmp_dir, "images")
        os.makedirs(img_dir, exist_ok=True)

        pdf_path = os.path.join(tmp_dir, "input.pdf")
        with open(pdf_path, "wb") as f:
            f.write(data)

        opendataloader_pdf.convert(
            input_path=pdf_path,
            output_dir=tmp_dir,
            format="json",
            image_output="external",
            image_format="png",
            image_dir=img_dir,
            quiet=True,
        )

        # Parse JSON for page-number mapping
        json_files = glob.glob(os.path.join(tmp_dir, "*.json"))
        page_map = {}
        if json_files:
            with open(json_files[0], "r") as f:
                meta = json.load(f)
            img_nodes = []
            collect_image_nodes(meta, img_nodes)
            for node in img_nodes:
                src = node.get("source", "")
                page_map[os.path.basename(src)] = node.get("page number", 0)

        images = []
        idx = 0
        for img_file in sorted(os.listdir(img_dir)):
            img_path = os.path.join(img_dir, img_file)
            if not os.path.isfile(img_path):
                continue
            try:
                image_bytes = open(img_path, "rb").read()
                pil_img = Image.open(io.BytesIO(image_bytes))
                width, height = pil_img.size
                if width < 100 or height < 100:
                    continue
                colors = pil_img.getcolors(maxcolors=2)
                if colors and len(colors) == 1:
                    continue

                pno = page_map.get(img_file, 0)
                chapter = f"Page {pno}" if pno else "Unknown Page"
                images.append({
                    "bytes": image_bytes, "ext": "png", "index": idx,
                    "chapter": chapter, "summary": "Extracted from PDF",
                    "caption": f"Image from page {pno}" if pno else "Image from PDF",
                })
                idx += 1
            except Exception as e:
                print(f"[Error] Image {img_file}: {e}")
        return images
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def extract_images_fitz(data: bytes):
    """Fallback: use PyMuPDF (fitz) when opendataloader_pdf fails."""
    import fitz

    doc = fitz.open(stream=data, filetype="pdf")
    images = []
    idx = 0
    for pno in range(len(doc)):
        page = doc[pno]
        chapter = f"Page {pno + 1}"
        try:
            image_list = page.get_images(full=True)
        except Exception:
            continue
        for img_info in image_list:
            xref = img_info[0]
            try:
                base = doc.extract_image(xref)
                image_bytes = base["image"]
                image_ext = base["ext"]
                width = base.get("width", 0)
                height = base.get("height", 0)
                if width < 100 or height < 100:
                    continue
                try:
                    pil_img = Image.open(io.BytesIO(image_bytes))
                    colors = pil_img.getcolors(maxcolors=2)
                    if colors and len(colors) == 1:
                        continue
                except Exception:
                    pass
                images.append({
                    "bytes": image_bytes, "ext": image_ext, "index": idx,
                    "chapter": chapter, "summary": "Extracted from PDF",
                    "caption": f"Image from page {pno + 1}",
                })
                idx += 1
            except Exception as e:
                print(f"[Error] Page {pno} image {idx}: {e}")
    doc.close()
    return images


def extract_images_with_info(data: bytes):
    try:
        return extract_images_opendataloader(data)
    except Exception as e:
        print(f"[Warning] opendataloader_pdf failed, falling back to PyMuPDF: {e}")
    try:
        return extract_images_fitz(data)
    except Exception as e:
        print(f"[Error] PDF processing: {e}")
        return []


def extract_images_from_pdf(abs_path: str) -> dict:
    """Read a PDF from disk and extract images. Returns {totalImages, imagesByChapter}.

    This is the service-level entry point used by both the HTTP route handler
    and the transfer-dispatch pipeline (sub3).
    """
    import base64

    with open(abs_path, "rb") as f:
        data = f.read()
    images = extract_images_with_info(data)
    if not images:
        return {"totalImages": 0, "imagesByChapter": {}}

    images_by_chapter: dict = {}
    for img in images:
        chapter = img["chapter"]
        if chapter not in images_by_chapter:
            images_by_chapter[chapter] = []

        img_base64 = base64.b64encode(img["bytes"]).decode("utf-8")
        images_by_chapter[chapter].append({
            "src": f"data:image/{img['ext']};base64,{img_base64}",
            "index": img["index"],
            "chapter": img["chapter"],
            "summary": img["summary"],
            "caption": img["caption"],
        })

    return {
        "totalImages": len(images),
        "imagesByChapter": images_by_chapter,
    }
