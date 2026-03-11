import os
from marker.converters.pdf import PdfConverter
from marker.models import create_model_dict
from marker.output import text_from_rendered

def convert_pdf_to_md(file_path, output_path):
    converter = PdfConverter(
        artifact_dict=create_model_dict(),
    )
    rendered = converter(file_path)
    text, _, images = text_from_rendered(rendered)

    with open(output_path, "w+", encoding="utf-8") as f:
        f.write(text)

    output_dir = os.path.dirname(output_path)

    for filename, image in images.items():
        image_filepath = os.path.join(output_dir, filename)
        image.save(image_filepath, "JPEG")
