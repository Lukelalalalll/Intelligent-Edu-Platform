from __future__ import annotations

from typing import Any

from services.chat.presentation_context_store import PresentationContextStore
from services.chat.schemas import GenerateAssetsInput, GenerateIconInput, GenerateImageInput


async def generate_image(
    memory: PresentationContextStore,
    args: dict[str, Any],
) -> dict[str, Any]:
    payload = GenerateImageInput(**args)
    image_url = await memory.generate_image(payload.prompt)
    return {
        "prompt": payload.prompt,
        "url": image_url,
    }


async def generate_icon(
    memory: PresentationContextStore,
    args: dict[str, Any],
) -> dict[str, Any]:
    payload = GenerateIconInput(**args)
    icon_url = await memory.generate_icon(payload.query)
    return {
        "query": payload.query,
        "url": icon_url,
    }


async def generate_assets(
    memory: PresentationContextStore,
    args: dict[str, Any],
) -> dict[str, Any]:
    payload = GenerateAssetsInput(**args)
    generated_assets: list[dict[str, Any]] = []

    for index, asset in enumerate(payload.assets):
        if asset.kind == "image":
            result = await generate_image(memory, {"prompt": asset.prompt})
        else:
            result = await generate_icon(memory, {"query": asset.prompt})
        generated_assets.append(
            {
                "index": index,
                "kind": asset.kind,
                "prompt": asset.prompt,
                "url": result.get("url"),
            }
        )

    return {
        "count": len(generated_assets),
        "assets": generated_assets,
        "message": f"Generated {len(generated_assets)} asset(s).",
    }
