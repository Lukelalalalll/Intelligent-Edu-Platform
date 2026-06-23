"""Service helpers for sub3 image extraction."""
from __future__ import annotations

import base64
import hashlib
import io
import re
import unicodedata

from PIL import Image

from backend.utils.pdf_loader_adapter import convert_pdf


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
    if str(node.get("type", "")).lower() == "image":
        results.append(node)
    for child in node.get("kids", []):
        collect_image_nodes(child, results)


def extract_images_opendataloader(data: bytes):
    import glob
    import json
    import os
    import shutil
    import tempfile

    tmp_dir = tempfile.mkdtemp(prefix="sub3_pdf_")
    try:
        img_dir = os.path.join(tmp_dir, "images")
        os.makedirs(img_dir, exist_ok=True)
        pdf_path = os.path.join(tmp_dir, "input.pdf")
        with open(pdf_path, "wb") as handle:
            handle.write(data)
        convert_pdf(
            input_path=pdf_path,
            output_dir=tmp_dir,
            format="json",
            image_output="external",
            image_format="png",
            image_dir=img_dir,
            quiet=True,
        )
        json_files = glob.glob(os.path.join(tmp_dir, "*.json"))
        page_map = {}
        if json_files:
            with open(json_files[0], "r") as handle:
                meta = json.load(handle)
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
                images.append(
                    {
                        "bytes": image_bytes,
                        "ext": "png",
                        "index": idx,
                        "chapter": f"Page {pno}" if pno else "Unknown Page",
                        "summary": "Extracted from PDF",
                        "caption": f"Image from page {pno}" if pno else "Image from PDF",
                    }
                )
                idx += 1
            except Exception as exc:
                print(f"[Error] Image {img_file}: {exc}")
        return images
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def extract_images_fitz(data: bytes):
    import fitz

    doc = fitz.open(stream=data, filetype="pdf")
    images = []
    idx = 0
    for pno in range(len(doc)):
        page = doc[pno]
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
                images.append(
                    {
                        "bytes": image_bytes,
                        "ext": image_ext,
                        "index": idx,
                        "chapter": f"Page {pno + 1}",
                        "summary": "Extracted from PDF",
                        "caption": f"Image from page {pno + 1}",
                    }
                )
                idx += 1
            except Exception as exc:
                print(f"[Error] Page {pno} image {idx}: {exc}")
    doc.close()
    return images


def extract_images_with_info(data: bytes):
    try:
        return extract_images_opendataloader(data)
    except Exception as exc:
        print(f"[Warning] opendataloader_pdf failed, falling back to PyMuPDF: {exc}")
    try:
        return extract_images_fitz(data)
    except Exception as exc:
        print(f"[Error] PDF processing: {exc}")
        return []


def extract_images_from_pdf(abs_path: str) -> dict:
    with open(abs_path, "rb") as handle:
        data = handle.read()
    images = extract_images_with_info(data)
    if not images:
        return {"totalImages": 0, "imagesByChapter": {}}

    images_by_chapter: dict[str, list[dict]] = {}
    for img in images:
        chapter = img["chapter"]
        images_by_chapter.setdefault(chapter, [])
        img_base64 = base64.b64encode(img["bytes"]).decode("utf-8")
        images_by_chapter[chapter].append(
            {
                "src": f"data:image/{img['ext']};base64,{img_base64}",
                "index": img["index"],
                "chapter": img["chapter"],
                "summary": img["summary"],
                "caption": img["caption"],
            }
        )
    return {"totalImages": len(images), "imagesByChapter": images_by_chapter}
