from __future__ import annotations

import asyncio


async def generate_all_images_async(*, host, enhanced_image_data_list: list[dict], max_concurrency: int) -> list[str]:
    semaphore = asyncio.Semaphore(max_concurrency)

    async def limited_generation(image_data, index):
        async with semaphore:
            return await host._generate_single_image_async(image_data, index)

    return await asyncio.gather(
        *[limited_generation(image_data, index) for index, image_data in enumerate(enhanced_image_data_list)]
    )
