from __future__ import annotations

import asyncio
import os

import aiohttp

MAX_CONCURRENT_LLM_CALLS = int(os.getenv("SUB1_MAX_CONCURRENT_LLM", "5"))


async def fetch_summary_payload(
    *,
    session: aiohttp.ClientSession,
    url: str,
    headers: dict[str, str],
    payload: dict,
) -> dict:
    try:
        async with session.post(
            url,
            json=payload,
            headers=headers,
            ssl=False,
            timeout=aiohttp.ClientTimeout(total=90),
        ) as response:
            response.raise_for_status()
            return await response.json()
    except aiohttp.ClientError as exc:
        print(f"Request failed: {exc}")
        return {"_error": str(exc)}
    except asyncio.TimeoutError:
        print("Request timed out")
        return {"_error": "timeout"}
