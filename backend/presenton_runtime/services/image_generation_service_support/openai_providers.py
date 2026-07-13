import aiohttp
from openai import NOT_GIVEN, AsyncOpenAI
from urllib.parse import urlparse

from utils.get_env import (
    get_dall_e_3_quality_env,
    get_gpt_image_1_5_quality_env,
    get_openai_compat_image_api_key_env,
    get_openai_compat_image_base_url_env,
    get_openai_compat_image_model_env,
)

from services.image_generation_service_support.common import (
    origin_from_base_url,
    save_base64_image,
    save_image_bytes,
)


class OpenAIImageGenerationMixin:
    async def generate_image_openai(
        self,
        prompt: str,
        output_directory: str,
        model: str,
        quality: str,
    ) -> str:
        client = AsyncOpenAI()
        result = await client.images.generate(
            model=model,
            prompt=prompt,
            n=1,
            quality=quality,
            response_format="b64_json" if model == "dall-e-3" else NOT_GIVEN,
            size="1024x1024",
        )
        return save_base64_image(output_directory, result.data[0].b64_json)

    async def generate_image_openai_dalle3(
        self,
        prompt: str,
        output_directory: str,
    ) -> str:
        return await self.generate_image_openai(
            prompt,
            output_directory,
            "dall-e-3",
            get_dall_e_3_quality_env() or "standard",
        )

    async def generate_image_openai_gpt_image_1_5(
        self,
        prompt: str,
        output_directory: str,
    ) -> str:
        return await self.generate_image_openai(
            prompt,
            output_directory,
            "gpt-image-1.5",
            get_gpt_image_1_5_quality_env() or "medium",
        )

    async def generate_image_openai_compatible(
        self,
        prompt: str,
        output_directory: str,
    ) -> str:
        base_url = get_openai_compat_image_base_url_env()
        api_key = get_openai_compat_image_api_key_env()
        model = get_openai_compat_image_model_env()
        if not base_url or not api_key or not model:
            raise ValueError(
                "OPENAI_COMPAT_IMAGE_BASE_URL, OPENAI_COMPAT_IMAGE_API_KEY and OPENAI_COMPAT_IMAGE_MODEL must be set."
            )

        origin = origin_from_base_url(base_url)
        client = AsyncOpenAI(base_url=base_url, api_key=api_key)
        response = await client.images.generate(
            model=model,
            prompt=prompt,
            n=1,
            size="1024x1024",
        )

        item = response.data[0]
        if item.b64_json:
            return save_base64_image(output_directory, item.b64_json)
        if item.url:
            image_url = item.url
            is_relative_url = image_url.startswith("/")
            if is_relative_url:
                image_url = origin + image_url
            image_origin = urlparse(image_url)
            base_origin = urlparse(base_url)
            headers = {}
            if is_relative_url or (
                image_origin.scheme == base_origin.scheme
                and image_origin.netloc == base_origin.netloc
            ):
                headers["Authorization"] = f"Bearer {api_key}"
            async with aiohttp.ClientSession(trust_env=True) as session:
                response = await session.get(
                    image_url,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=120),
                )
                if response.status != 200:
                    raise Exception(
                        f"Failed to download image from OpenAI-compatible provider: {response.status}"
                    )
                payload = await response.read()
            return save_image_bytes(output_directory, payload)
        raise Exception("OpenAI-compatible provider returned no image data")


__all__ = ["OpenAIImageGenerationMixin"]
