from __future__ import annotations

import json
import logging
import os
from typing import Any
from urllib.parse import urlencode

import aiohttp
from fastapi import HTTPException

from services.export_task_service import EXPORT_TASK_SERVICE
from utils.internal_http import internal_request_headers

LOGGER = logging.getLogger(__name__)
_MAX_LOG_DETAIL = 600


def preview_detail(text: str, limit: int = _MAX_LOG_DETAIL) -> str:
    text = text.replace("\n", " ").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 3] + "..."


def read_builtin_template_settings(layout_name: str) -> dict[str, Any] | None:
    if not layout_name or layout_name.startswith("custom-"):
        return None
    if "/" in layout_name or "\\" in layout_name or layout_name in {".", ".."}:
        return None

    service_dir = os.path.dirname(__file__)
    candidates = [
        os.path.abspath(
            os.path.join(
                service_dir,
                "..",
                "..",
                "..",
                "nextjs",
                "app",
                "presentation-templates",
                layout_name,
                "settings.json",
            )
        ),
        os.path.abspath(
            os.path.join(
                os.getcwd(),
                "..",
                "nextjs",
                "app",
                "presentation-templates",
                layout_name,
                "settings.json",
            )
        ),
    ]

    for settings_path in candidates:
        if not os.path.isfile(settings_path):
            continue
        try:
            with open(settings_path, "r", encoding="utf-8") as settings_file:
                settings = json.load(settings_file)
            return settings if isinstance(settings, dict) else None
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning(
                "[template_layout] failed reading local template settings template=%r path=%s error=%s",
                layout_name,
                settings_path,
                preview_detail(str(exc)),
            )
            return None
    return None


async def fetch_primary_schema_payload(layout_name: str) -> tuple[dict[str, Any] | None, str | None]:
    query = urlencode({"group": layout_name})
    url = f"http://localhost/schema?{query}"
    LOGGER.info(
        "[template_layout] resolving template=%r primary_schema_url=%s",
        layout_name,
        url,
    )
    try:
        schema = await EXPORT_TASK_SERVICE.extract_schema(url)
        payload = schema.model_dump()
        slide_ids = [slide.get("id") for slide in payload.get("slides") or []][:12]
        LOGGER.info(
            "[template_layout] extract-schema succeeded template=%r payload_name=%r ordered=%s icon_weight=%s slide_count=%d slide_ids(sample)=%s",
            layout_name,
            payload.get("name"),
            payload.get("ordered"),
            payload.get("icon_weight"),
            len(payload.get("slides") or []),
            slide_ids,
        )
        return payload, None
    except HTTPException as exc:
        return None, str(exc.detail)
    except Exception as exc:  # noqa: BLE001
        return None, str(exc)


async def fetch_template_fallback_payload(
    layout_name: str,
) -> tuple[dict[str, Any] | None, str | None]:
    fallback_url = f"http://localhost/api/template?group={layout_name}"
    LOGGER.info(
        "[template_layout] trying HTTP fallback template=%r url=%s",
        layout_name,
        fallback_url,
    )
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                fallback_url,
                headers=internal_request_headers(),
            ) as response:
                if response.status == 200:
                    payload = await response.json()
                    LOGGER.info(
                        "[template_layout] fallback OK template=%r slide_count=%d",
                        layout_name,
                        len(payload.get("slides") or []),
                    )
                    return payload, None
                error = await response.text()
                LOGGER.warning(
                    "[template_layout] fallback HTTP %s template=%r body=%s",
                    response.status,
                    layout_name,
                    preview_detail(error or ""),
                )
                return None, error
    except aiohttp.ClientError as exc:
        LOGGER.warning(
            "[template_layout] fallback request failed template=%r error=%s",
            layout_name,
            str(exc),
        )
        return None, str(exc)
    except Exception as exc:  # noqa: BLE001
        LOGGER.warning(
            "[template_layout] fallback unexpected error template=%r error=%s",
            layout_name,
            preview_detail(str(exc)),
        )
        return None, str(exc)
