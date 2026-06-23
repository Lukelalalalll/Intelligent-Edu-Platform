from __future__ import annotations

import asyncio
import os
import random
from datetime import datetime
from typing import Optional

import requests

from .deepseek_adapter import call_deepseek_for_tikz, generate_mermaid_code
from .latex_renderer import clean_latex_code, compile_latex, create_latex_document
from .mermaid_renderer import render_mermaid_to_image
from .pdf_converter import convert_pdf_to_image
from .search_fallback import search_diagram_fallback


class DiagramGenerator:
    def __init__(self, deepseek_api_key: Optional[str] = None, serp_api_key: Optional[str] = None):
        from backend.config import Config

        self.deepseek_api_key = deepseek_api_key or Config.DEEPSEEK_API_KEY
        self.serp_api_key = serp_api_key or Config.SERP_API_KEY
        self.session = requests.Session()
        self.session.trust_env = False
        self.session.verify = True
        current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.output_dir = os.path.join(current_dir, "static", "ppt_templates", "diagrams")
        os.makedirs(self.output_dir, exist_ok=True)

    def generate_diagram_from_prompt(self, prompt: str, output_dir: str = None, ratio: int = 0, num_images: int = 1, chart_type: str = "") -> Optional[str]:
        del num_images
        output_dir = output_dir or self.output_dir
        os.makedirs(output_dir, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        random_num = random.randint(1000, 9999)
        output_filename = f"generated_diagram_{timestamp}_{random_num}"
        try:
            mermaid_types = {"timeline", "flowchart", "sequence", "class", "state", "gantt", "pie chart"}
            if chart_type.lower() in mermaid_types:
                mermaid_code = generate_mermaid_code(self.session, self.deepseek_api_key, prompt)
                if mermaid_code:
                    mermaid_output_path = os.path.join(output_dir, f"{output_filename}_mermaid.png")
                    if render_mermaid_to_image(mermaid_code, mermaid_output_path):
                        return mermaid_output_path

            latex_code = call_deepseek_for_tikz(self.session, self.deepseek_api_key, prompt)
            if not latex_code:
                return search_diagram_fallback(
                    serp_api_key=self.serp_api_key,
                    prompt=prompt,
                    output_dir=output_dir,
                    timestamp=timestamp,
                    random_num=random_num,
                )

            tikz_code = clean_latex_code(latex_code)
            tex_path = os.path.join(output_dir, f"{output_filename}.tex")
            create_latex_document(tex_path, tikz_code)
            if not compile_latex(output_filename, output_dir):
                return search_diagram_fallback(
                    serp_api_key=self.serp_api_key,
                    prompt=prompt,
                    output_dir=output_dir,
                    timestamp=timestamp,
                    random_num=random_num,
                )

            pdf_path = os.path.join(output_dir, f"{output_filename}.pdf")
            image_path = convert_pdf_to_image(pdf_path, ratio=ratio)
            if image_path and os.path.exists(image_path) and os.path.getsize(image_path) > 0:
                return image_path
            return search_diagram_fallback(
                serp_api_key=self.serp_api_key,
                prompt=prompt,
                output_dir=output_dir,
                timestamp=timestamp,
                random_num=random_num,
            )
        except Exception as exc:
            print(f"Error generating diagram: {exc}")
            return search_diagram_fallback(
                serp_api_key=self.serp_api_key,
                prompt=prompt,
                output_dir=output_dir,
                timestamp=timestamp,
                random_num=random_num,
            )

    async def generate_diagram_from_prompt_async(self, prompt: str, output_dir: str = None, ratio: int = 0, num_images: int = 1, chart_type: str = "") -> Optional[str]:
        return await asyncio.to_thread(
            self.generate_diagram_from_prompt,
            prompt=prompt,
            output_dir=output_dir,
            ratio=ratio,
            num_images=num_images,
            chart_type=chart_type,
        )


diagram_generator = DiagramGenerator()


async def generate_diagram_from_prompt_async(prompt: str, output_dir: str = None, ratio: int = 0, num_images: int = 1, chart_type: str = "") -> Optional[str]:
    return await diagram_generator.generate_diagram_from_prompt_async(
        prompt,
        output_dir,
        ratio,
        num_images,
        chart_type,
    )
