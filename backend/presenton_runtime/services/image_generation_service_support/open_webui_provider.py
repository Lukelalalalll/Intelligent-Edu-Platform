import aiohttp

from utils.get_env import (
    get_open_webui_image_api_key_env,
    get_open_webui_image_url_env,
)

from services.image_generation_service_support.common import (
    origin_from_base_url,
    save_base64_image,
    save_image_bytes,
)


class OpenWebUIImageGenerationMixin:
    async def generate_image_open_webui(
        self,
        prompt: str,
        output_directory: str,
    ) -> str:
        base_url = get_open_webui_image_url_env()
        if not base_url:
            raise ValueError("OPEN_WEBUI_IMAGE_URL environment variable is not set")

        base_url = base_url.rstrip("/")
        origin = origin_from_base_url(base_url)
        api_key = get_open_webui_image_api_key_env() or ""

        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        payload = {"prompt": prompt, "n": 1, "size": "1024x1024"}
        async with aiohttp.ClientSession(trust_env=True) as session:
            response = await session.post(
                f"{base_url}/images/generations",
                json=payload,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=300),
            )
            if response.status != 200:
                error_text = await response.text()
                raise Exception(
                    f"Open WebUI image generation returned {response.status}: {error_text}"
                )

            body = await response.json()
            if isinstance(body, list):
                items = body
            elif isinstance(body, dict) and "data" in body:
                items = body["data"]
            else:
                raise Exception(f"Unexpected response format: {type(body)}")
            if not items:
                raise Exception("Open WebUI returned empty results")

            item = items[0]
            if item.get("b64_json"):
                return save_base64_image(output_directory, item["b64_json"])
            if item.get("url"):
                image_url = item["url"]
                if image_url.startswith("/"):
                    image_url = origin + image_url
                download_headers = {}
                if api_key:
                    download_headers["Authorization"] = f"Bearer {api_key}"
                download_response = await session.get(
                    image_url,
                    headers=download_headers,
                    timeout=aiohttp.ClientTimeout(total=120),
                )
                if download_response.status != 200:
                    raise Exception(
                        f"Failed to download image: {download_response.status}"
                    )
                payload = await download_response.read()
                return save_image_bytes(output_directory, payload)
            raise Exception("Open WebUI returned no image data")


__all__ = ["OpenWebUIImageGenerationMixin"]
