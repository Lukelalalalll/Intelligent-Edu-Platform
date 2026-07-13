from models.image_prompt import ImagePrompt
from models.sql.image_asset import ImageAsset

from services.image_generation_service_support.common import (
    is_stock_provider_selected,
    normalize_generation_exception,
    placeholder_image_url,
    resolve_generated_image_result,
    select_image_generation_method,
)


class ImageGenerationOrchestrationMixin:
    def get_image_gen_func(self):
        return select_image_generation_method(self)

    def is_stock_provider_selected(self):
        return is_stock_provider_selected()

    async def generate_image(self, prompt: ImagePrompt) -> str | ImageAsset:
        if self.is_image_generation_disabled:
            print("Image generation is disabled. Using placeholder image.")
            return placeholder_image_url()

        if not self.image_gen_func:
            print("No image generation function found. Using placeholder image.")
            return placeholder_image_url()

        image_prompt = prompt.get_image_prompt(
            with_theme=not self.is_stock_provider_selected()
        )
        print(f"Request - Generating Image for {image_prompt}")

        try:
            if self.is_stock_provider_selected():
                image_path = await self.image_gen_func(image_prompt)
            else:
                image_path = await self.image_gen_func(
                    image_prompt, self.output_directory
                )
            return resolve_generated_image_result(
                image_path,
                prompt_text=prompt.prompt,
                theme_prompt=prompt.theme_prompt,
            )
        except Exception as error:
            print(f"Error generating image: {error}")
            normalized_error = normalize_generation_exception(error)
            if normalized_error is error:
                raise
            raise normalized_error from error


__all__ = ["ImageGenerationOrchestrationMixin"]
