import glob
import os

import opendataloader_pdf

def convert_pdf_to_md(file_path, output_path):
    output_dir = os.path.dirname(output_path)
    os.makedirs(output_dir, exist_ok=True)

    # Use OpenDataLoader local mode for fast deterministic PDF -> Markdown conversion.
    opendataloader_pdf.convert(
        input_path=file_path,
        output_dir=output_dir,
        format="markdown",
        quiet=True,
        image_output="off",
    )

    if os.path.exists(output_path):
        return

    stem = os.path.splitext(os.path.basename(file_path))[0]
    candidates = sorted(
        glob.glob(os.path.join(output_dir, f"{stem}*.md")),
        key=os.path.getmtime,
        reverse=True,
    )
    if not candidates:
        raise RuntimeError(f"OpenDataLoader did not generate markdown for: {file_path}")

    if candidates[0] != output_path:
        os.replace(candidates[0], output_path)
