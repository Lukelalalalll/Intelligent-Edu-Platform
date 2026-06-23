from __future__ import annotations

import os

from .default_assets import generate_image_prompt, get_default_image_path
from .image_batching import generate_all_images_async
from .prompt_enhancer import call_deepseek_for_prompt, generate_all_prompts_async
from .prompt_persistence import save_prompt_to_file

MAX_CONCURRENT_IMAGE_GEN = int(os.getenv("SUB1_MAX_CONCURRENT_IMAGE", "4"))


class ImageChartProcessor:
    def __init__(self, deepseek_base_url="https://api.deepseek.com/v1"):
        current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.base_path = os.path.join(current_dir, "static", "ppt_templates", "images")
        self.diagram_path = os.path.join(current_dir, "static", "ppt_templates", "diagrams")
        self.prompt_save_dir = "chart_prompts"
        os.makedirs(self.prompt_save_dir, exist_ok=True)

        from backend.config import Config

        self.deepseek_api_key = Config.DEEPSEEK_API_KEY
        self.deepseek_base_url = deepseek_base_url

    async def process_multiple_images_async(self, image_data_list):
        if not image_data_list:
            return []
        enhanced_image_data = await generate_all_prompts_async(host=self, image_data_list=image_data_list)
        return await generate_all_images_async(
            host=self,
            enhanced_image_data_list=enhanced_image_data,
            max_concurrency=MAX_CONCURRENT_IMAGE_GEN,
        )

    async def _generate_image_prompt_with_deepseek_async(self, image_data, index):
        print(f"Generating prompt for image {index + 1}: {image_data.get('title', 'Unknown')}")
        try:
            enhanced_prompt = await call_deepseek_for_prompt(
                api_key=self.deepseek_api_key,
                base_url=self.deepseek_base_url,
                image_data=image_data,
            )
            enhanced_data = image_data.copy()
            enhanced_data["enhanced_prompt"] = enhanced_prompt
            save_prompt_to_file(
                prompt=enhanced_prompt,
                image_data=image_data,
                prompt_type="image_enhanced",
                prompt_save_dir=self.prompt_save_dir,
            )
            return enhanced_data
        except Exception as exc:
            print(f"Failed to generate enhanced prompt for image {index + 1}: {exc}")
            enhanced_data = image_data.copy()
            enhanced_data["enhanced_prompt"] = generate_image_prompt(image_data)
            return enhanced_data

    async def _generate_single_image_async(self, image_data, index):
        print(f"Generating image {index + 1}: {image_data.get('title', 'Unknown')}")
        try:
            return get_default_image_path(
                base_path=self.base_path,
                diagram_path=self.diagram_path,
                image_data=image_data,
            )
        except Exception as exc:
            print(f"Error generating image {index + 1}: {exc}")
            return get_default_image_path(
                base_path=self.base_path,
                diagram_path=self.diagram_path,
                image_data=image_data,
            )
