"""Diagram Copilot SSE endpoint with diagram-scoped tool calling."""

from __future__ import annotations

import html
import json
import logging
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.core.ai_provider import resolve_provider_runtime
from backend.core.database import compute_history_expires_at, db
from backend.core.security import get_current_user
from backend.routes.ai_routes.chat_streaming import (
    SSE_DONE,
    sse_delta,
    sse_error,
    sse_meta,
    sse_tool_progress,
    sse_ui_element,
)
from backend.routes.diagram_routes.search_download import search_svg_candidates
from backend.routes.image_extractor_routes.search_generate import generate_ai_images_for_diagram
from backend.services.ai_gateway_service import get_ai_gateway_service
from backend.services.history_service import get_history_document, serialize_history_doc
from backend.services.visual.diagram_service import generate_svg_with_runtime
from backend.utils.svg_utils import (
    extract_svg_from_ai_output,
    validate_svg_xml,
)

from .router import diagram_router

logger = logging.getLogger(__name__)

AssistantProvider = Literal["auto", "openai", "deepseek", "bigmodel", "local_ollama", "coze"]
AssistantService = Literal["extract", "images", "search", "generate"]


class DiagramAssistantMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class DiagramAssistantRequest(BaseModel):
    messages: list[DiagramAssistantMessage]
    provider: AssistantProvider = "auto"
    active_service: AssistantService = "generate"
    workspace_state: dict[str, Any] = Field(default_factory=dict)


DIAGRAM_TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "diagram_generate_svg",
            "description": "Generate an educational SVG diagram from a natural language brief.",
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {"type": "string", "description": "Diagram topic or teaching brief."},
                    "style": {"type": "string", "description": "Optional visual style instruction."},
                },
                "required": ["prompt"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "diagram_expand_brief",
            "description": "Expand a short topic into a structured diagram-generation brief.",
            "parameters": {
                "type": "object",
                "properties": {"brief": {"type": "string"}},
                "required": ["brief"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "diagram_extract_document",
            "description": "Summarize diagrams or images already extracted from the current uploaded document.",
            "parameters": {
                "type": "object",
                "properties": {
                    "instruction": {"type": "string"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "diagram_search_svg",
            "description": "Search the web for editable SVG diagram candidates.",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string"}},
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "diagram_edit_svg_text",
            "description": "Replace visible text labels in the current SVG without changing other structure.",
            "parameters": {
                "type": "object",
                "properties": {
                    "source_text": {"type": "string"},
                    "target_text": {"type": "string"},
                    "replacements": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "from": {"type": "string"},
                                "to": {"type": "string"},
                            },
                            "required": ["from", "to"],
                        },
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "diagram_refine_svg",
            "description": "Redraw or restyle the current SVG while preserving educational semantics.",
            "parameters": {
                "type": "object",
                "properties": {"instruction": {"type": "string"}},
                "required": ["instruction"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "diagram_generate_images",
            "description": "Generate teaching illustration images from a prompt.",
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {"type": "string"},
                    "num_images": {"type": "integer", "minimum": 1, "maximum": 8},
                },
                "required": ["prompt"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "diagram_export_assets",
            "description": "Prepare an export intent for current SVG or selected images.",
            "parameters": {
                "type": "object",
                "properties": {
                    "asset_type": {"type": "string", "enum": ["svg", "images"]},
                    "format": {"type": "string", "enum": ["svg", "zip", "pdf"]},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "diagram_replay_history",
            "description": "Replay a diagram or image extractor history record into the workspace.",
            "parameters": {
                "type": "object",
                "properties": {"history_id": {"type": "string"}},
                "required": ["history_id"],
            },
        },
    },
]

ALLOWED_TOOL_NAMES = {
    "diagram_generate_svg",
    "diagram_expand_brief",
    "diagram_extract_document",
    "diagram_search_svg",
    "diagram_edit_svg_text",
    "diagram_refine_svg",
    "diagram_generate_images",
    "diagram_export_assets",
    "diagram_replay_history",
}


def _last_user_message(messages: list[dict[str, str]]) -> str:
    return next((item["content"] for item in reversed(messages) if item.get("role") == "user"), "")


def _load_json_object(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if raw is None:
        return {}
    text = str(raw).strip()
    if not text:
        return {}
    try:
        value = json.loads(text)
        return value if isinstance(value, dict) else {}
    except json.JSONDecodeError:
        return {}


def _normalize_tool_calls(raw_calls: Any) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for index, item in enumerate(raw_calls or []):
        item_dict = item if isinstance(item, dict) else {}
        function = item_dict.get("function")
        if not isinstance(function, dict):
            function = item_dict
        name = str(function.get("name") or item_dict.get("name") or "").strip()
        if name not in ALLOWED_TOOL_NAMES:
            continue
        normalized.append({
            "id": str(item_dict.get("id") or f"call_{index + 1}"),
            "name": name,
            "arguments": _load_json_object(function.get("arguments") or item_dict.get("arguments")),
        })
    return normalized[:3]


def _extract_replacement_from_text(text: str) -> tuple[str, str] | None:
    patterns = [
        r"把(?:当前\s*)?(?:svg|SVG)?\s*(?:里面的|里的|中的|里|的)?\s*['\"“”‘’]?(.+?)['\"“”‘’]?\s*(?:改成|替换成|换成)\s*['\"“”‘’]?(.+?)['\"“”‘’]?$",
        r"replace\s+['\"]?(.+?)['\"]?\s+(?:with|to)\s+['\"]?(.+?)['\"]?$",
        r"change\s+['\"]?(.+?)['\"]?\s+(?:to|into)\s+['\"]?(.+?)['\"]?$",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            source = match.group(1).strip(" '\"“”‘’。.")
            target = match.group(2).strip(" '\"“”‘’。.")
            if source and target:
                return source, target
    return None


def _fallback_tool_calls(
    *,
    user_text: str,
    active_service: str,
    workspace_state: dict[str, Any],
) -> list[dict[str, Any]]:
    lower = user_text.lower()
    if workspace_state.get("current_svg"):
        replacement = _extract_replacement_from_text(user_text)
        if replacement:
            return [{
                "id": "rule_edit_svg_text",
                "name": "diagram_edit_svg_text",
                "arguments": {"source_text": replacement[0], "target_text": replacement[1]},
            }]
        if any(word in lower for word in ["重新排版", "重绘", "refine", "redraw", "restyle", "课堂讲解"]):
            return [{
                "id": "rule_refine_svg",
                "name": "diagram_refine_svg",
                "arguments": {"instruction": user_text},
            }]
    if any(word in user_text for word in ["搜索", "找一个", "找些", "SVG", "svg"]) and "生成" not in user_text:
        return [{
            "id": "rule_search_svg",
            "name": "diagram_search_svg",
            "arguments": {"query": user_text},
        }]
    if any(word in user_text for word in ["配图", "图片", "插图"]) or "image" in lower:
        return [{
            "id": "rule_generate_images",
            "name": "diagram_generate_images",
            "arguments": {"prompt": user_text, "num_images": 4},
        }]
    if active_service == "extract" and any(word in user_text for word in ["提取", "pdf", "PDF", "总结"]):
        return [{
            "id": "rule_extract_document",
            "name": "diagram_extract_document",
            "arguments": {"instruction": user_text},
        }]
    return [{
        "id": "rule_generate_svg",
        "name": "diagram_generate_svg",
        "arguments": {"prompt": user_text},
    }]


def _sanitize_svg(svg: str) -> str:
    ET.register_namespace("", "http://www.w3.org/2000/svg")
    ET.register_namespace("xlink", "http://www.w3.org/1999/xlink")
    root = ET.fromstring(svg)
    banned = {
        "script",
        "foreignobject",
        "iframe",
        "object",
        "embed",
        "link",
        "style",
        "animate",
        "animatetransform",
        "animatemotion",
        "set",
    }

    def local_name(tag: str) -> str:
        return str(tag).split("}", 1)[-1].lower()

    for parent in list(root.iter()):
        for child in list(parent):
            if local_name(child.tag) in banned:
                parent.remove(child)

    for el in root.iter():
        for attr in list(el.attrib):
            attr_name = local_name(attr)
            value = str(el.attrib.get(attr) or "").strip().lower()
            if attr_name.startswith("on"):
                el.attrib.pop(attr, None)
            elif attr_name in {"href", "xlink:href"} and value.startswith(("javascript:", "data:text/html")):
                el.attrib.pop(attr, None)
            elif attr_name == "style" and ("javascript:" in value or "expression(" in value):
                el.attrib.pop(attr, None)
    return ET.tostring(root, encoding="unicode")


def _safe_svg_from_ai(raw: str) -> str:
    svg = extract_svg_from_ai_output(raw)
    svg = _sanitize_svg(svg)
    ok, err = validate_svg_xml(svg)
    if not ok:
        raise ValueError(err or "Invalid SVG XML")
    return svg


def _replace_svg_text(svg: str, replacements: list[dict[str, str]]) -> tuple[str, int]:
    sanitized = _sanitize_svg(svg)
    root = ET.fromstring(sanitized)
    count = 0
    normalized_replacements = [
        (str(item.get("from") or "").strip(), str(item.get("to") or "").strip())
        for item in replacements
        if str(item.get("from") or "").strip()
    ]
    for el in root.iter():
        if el.text:
            next_text = el.text
            for source, target in normalized_replacements:
                if source in next_text:
                    next_text = next_text.replace(source, target)
                    count += 1
            el.text = next_text
        if el.tail:
            next_tail = el.tail
            for source, target in normalized_replacements:
                if source in next_tail:
                    next_tail = next_tail.replace(source, target)
                    count += 1
            el.tail = next_tail
    output = ET.tostring(root, encoding="unicode")
    ok, err = validate_svg_xml(output)
    if not ok:
        raise ValueError(err or "Invalid SVG after text replacement")
    return output, count


async def _execute_tool(
    *,
    name: str,
    args: dict[str, Any],
    runtime,
    ai_service,
    user: dict,
    workspace_state: dict[str, Any],
    user_text: str,
) -> tuple[str, dict[str, Any] | None]:
    user_id = str(user.get("id") or user.get("_id") or "anon")
    if name == "diagram_generate_svg":
        prompt = str(args.get("prompt") or user_text).strip()
        style = str(args.get("style") or "").strip()
        if style:
            prompt = f"{prompt}\n\nStyle: {style}"
        result = await generate_svg_with_runtime(
            text=prompt,
            runtime=runtime,
            user_id=user_id,
            ai_service=ai_service,
        )
        return (
            "已生成一张教学 SVG 图解，并放到 AI Generate 里。",
            {
                "type": "diagram_svg",
                "target_tab": "generate",
                "svg": result["svg"],
                "prompt": prompt,
                "meta": result,
            },
        )

    if name == "diagram_expand_brief":
        brief = str(args.get("brief") or user_text).strip()
        prompt = (
            "Expand this teaching topic into a concise, structured diagram brief. "
            "Include nodes, relationships, flow direction, and label suggestions. "
            "Return plain text only.\n\n"
            f"Topic: {brief}"
        )
        text = await ai_service.chat_with_runtime(
            message=prompt,
            context={"coze_user_id": f"diagram_expand_{user_id}"},
            runtime=runtime,
        )
        return text.strip(), {"type": "expanded_brief", "target_tab": "generate", "text": text.strip()}

    if name == "diagram_extract_document":
        extracted = workspace_state.get("extracted_images") or workspace_state.get("selected_images") or []
        if not extracted:
            return (
                "当前对话没有拿到已上传文件本体。请先在 Extract Diagram 或 Image Extract 上传 PDF，我会基于提取结果继续总结。",
                {"type": "document_extract_notice", "target_tab": "extract", "items": []},
            )
        prompt = (
            "Summarize these extracted teaching diagram/image records in Chinese. "
            "For each item, infer what it likely teaches from its caption, summary, chapter, page, or metadata. "
            "Keep it concise.\n\n"
            f"Records: {json.dumps(extracted[:20], ensure_ascii=False)}"
        )
        text = await ai_service.chat_with_runtime(
            message=prompt,
            context={"coze_user_id": f"diagram_extract_summary_{user_id}"},
            runtime=runtime,
        )
        return text.strip(), {
            "type": "extracted_summary",
            "target_tab": "extract",
            "summary": text.strip(),
            "items": extracted,
        }

    if name == "diagram_search_svg":
        query = str(args.get("query") or user_text).strip()
        results = search_svg_candidates(query)
        return (
            f"找到 {len(results)} 个 SVG 候选，已切到 Search & Edit SVG。",
            {
                "type": "svg_search_results",
                "target_tab": "search",
                "query": query,
                "results": results,
            },
        )

    if name == "diagram_edit_svg_text":
        current_svg = str(workspace_state.get("current_svg") or "").strip()
        if not current_svg:
            raise ValueError("当前没有可编辑 SVG。请先搜索/打开一个 SVG，或生成一张图解。")
        replacements = args.get("replacements")
        if not isinstance(replacements, list):
            source = str(args.get("source_text") or "").strip()
            target = str(args.get("target_text") or "").strip()
            replacements = [{"from": source, "to": target}] if source else []
        next_svg, count = _replace_svg_text(current_svg, replacements)
        if count <= 0:
            raise ValueError("没有找到匹配的 SVG 文本标签，预览未覆盖。")
        return (
            f"已完成 {count} 处 SVG 文本替换，并更新预览。",
            {
                "type": "edited_svg",
                "target_tab": "search",
                "svg": next_svg,
                "replacements": replacements,
                "count": count,
            },
        )

    if name == "diagram_refine_svg":
        current_svg = str(workspace_state.get("current_svg") or "").strip()
        if not current_svg:
            raise ValueError("当前没有 SVG 可重绘。")
        instruction = str(args.get("instruction") or user_text).strip()
        prompt = (
            "You are an expert educational SVG designer. Redraw/refine the SVG below according to the instruction. "
            "Preserve its teaching meaning, return ONLY one valid safe SVG XML, no markdown.\n\n"
            f"Instruction: {instruction}\n\nCurrent SVG:\n{current_svg}"
        )
        raw = await ai_service.chat_with_runtime(
            message=prompt,
            context={"coze_user_id": f"diagram_refine_svg_{user_id}"},
            runtime=runtime,
        )
        svg = _safe_svg_from_ai(raw)
        return (
            "已按课堂讲解风格重新整理当前 SVG，并更新预览。",
            {
                "type": "edited_svg",
                "target_tab": "search",
                "svg": svg,
                "replacements": [],
                "count": 0,
                "mode": "refine",
            },
        )

    if name == "diagram_generate_images":
        prompt = str(args.get("prompt") or user_text).strip()
        count = int(args.get("num_images") or 4)
        images, meta = await generate_ai_images_for_diagram(
            prompt=prompt,
            num_images=count,
            user=user,
            provider=str(getattr(runtime, "requested_provider", "auto") or "auto"),
        )
        return (
            f"已生成 {len(images)} 张教学配图，放到 Image Extract 的 AI Generate 分区。",
            {
                "type": "ai_images",
                "target_tab": "images",
                "images": images,
                "prompt": prompt,
                "meta": meta,
            },
        )

    if name == "diagram_export_assets":
        return (
            "已准备好导出动作，请在对应结果区确认资产后下载。",
            {
                "type": "export_assets",
                "target_tab": "images" if args.get("asset_type") == "images" else "generate",
                "asset_type": args.get("asset_type") or "svg",
                "format": args.get("format") or "svg",
            },
        )

    if name == "diagram_replay_history":
        history_id = str(args.get("history_id") or workspace_state.get("history_id") or "").strip()
        if not history_id:
            raise ValueError("缺少 history_id。")
        doc = await get_history_document(
            tools=("diagram", "image_extractor"),
            history_id=history_id,
            user_id=user_id,
        )
        if not doc:
            raise ValueError("找不到这条历史记录。")
        detail = serialize_history_doc(doc, include_result=True)
        return (
            "已读取历史记录，可从结果卡片回放到工作台。",
            {
                "type": "history_replay",
                "target_tab": str((detail.get("params") or {}).get("service_type") or "generate"),
                "history": detail,
            },
        )

    raise ValueError(f"Unsupported diagram tool: {html.escape(name)}")


def _assistant_messages(req: DiagramAssistantRequest) -> list[dict[str, str]]:
    system = (
        "You are Diagram Copilot for an education visual workbench. "
        "Teachers, course creators, and students use you to generate, extract, search, edit, and export diagrams. "
        "Prefer calling exactly one diagram tool when the user asks for an action. "
        "Use diagram_generate_svg for educational flowcharts/concept maps/process diagrams, "
        "diagram_search_svg for finding editable SVGs, diagram_edit_svg_text for label replacement, "
        "diagram_refine_svg for restyling/redrawing current SVGs, and diagram_generate_images for teaching illustrations. "
        "Keep user-facing text concise and in the user's language."
    )
    messages = [{"role": "system", "content": system}]
    messages.extend({"role": item.role, "content": item.content} for item in req.messages[-10:])
    return messages


@diagram_router.post("/assistant/stream")
async def diagram_assistant_stream(
    req: DiagramAssistantRequest,
    user: dict = Depends(get_current_user),
):
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages are required")

    async def event_stream():
        tool_records: list[dict[str, Any]] = []
        ui_elements: list[dict[str, Any]] = []
        assistant_text_parts: list[str] = []
        provider_meta: dict[str, Any] = {}
        try:
            runtime = await resolve_provider_runtime(
                req.provider,
                feature="diagram.assistant",
                user=user,
                require_healthy=True,
            )
            provider_meta = {
                **runtime.public_dict(),
                "provider_source": runtime.config_source,
                "feature": "diagram.assistant",
            }
            yield sse_meta(provider_meta)

            ai_service = get_ai_gateway_service()
            messages = _assistant_messages(req)
            user_text = _last_user_message(messages)

            yield sse_tool_progress("diagram_assistant", "running", "正在判断图解任务和可用工具...")
            try:
                plan = await ai_service.chat_with_tools_runtime(
                    runtime=runtime,
                    messages=messages,
                    tools=DIAGRAM_TOOLS,
                    context={
                        "coze_user_id": f"diagram_assistant_{user.get('id', 'anon')}",
                        "active_service": req.active_service,
                        "workspace_state_keys": list((req.workspace_state or {}).keys()),
                    },
                )
                tool_calls = _normalize_tool_calls(plan.get("tool_calls"))
                planner_content = str(plan.get("content") or "").strip()
            except Exception as exc:  # noqa: BLE001
                logger.warning("Diagram assistant planner failed; using rule fallback: %s", exc)
                tool_calls = []
                planner_content = ""

            if not tool_calls:
                tool_calls = _fallback_tool_calls(
                    user_text=user_text,
                    active_service=req.active_service,
                    workspace_state=req.workspace_state or {},
                )
            if planner_content:
                assistant_text_parts.append(planner_content)
                yield sse_delta(planner_content)

            for call in tool_calls:
                name = call["name"]
                args = call.get("arguments") or {}
                tool_records.append({"name": name, "arguments": args, "status": "running"})
                yield sse_tool_progress(name, "running", "正在执行图解工具...")
                try:
                    text, element = await _execute_tool(
                        name=name,
                        args=args,
                        runtime=runtime,
                        ai_service=ai_service,
                        user=user,
                        workspace_state=req.workspace_state or {},
                        user_text=user_text,
                    )
                    assistant_text_parts.append(text)
                    tool_records[-1]["status"] = "complete"
                    tool_records[-1]["message"] = text
                    yield sse_tool_progress(name, "complete", text)
                    if element:
                        ui_elements.append(element)
                        yield sse_ui_element(element)
                    if text:
                        yield sse_delta(("\n\n" if planner_content else "") + text)
                except Exception as exc:  # noqa: BLE001
                    message = str(exc)
                    tool_records[-1]["status"] = "error"
                    tool_records[-1]["error"] = message
                    yield sse_tool_progress(name, "error", message)
                    yield sse_delta(f"\n\n{message}")

            try:
                user_id = str(user.get("id") or user.get("_id") or "")
                expires_at = await compute_history_expires_at(user_id)
                doc = {
                    "user_id": user_id,
                    "tool": "diagram_assistant",
                    "params": {
                        "service_type": "assistant",
                        "provider": provider_meta.get("provider_id"),
                        "provider_source": provider_meta.get("provider_source"),
                        "requested_provider": provider_meta.get("requested_provider"),
                        "model": provider_meta.get("model"),
                        "active_service": req.active_service,
                    },
                    "source": {"messages": [item.model_dump() for item in req.messages]},
                    "result_preview": "Diagram Copilot: " + " ".join(assistant_text_parts)[:180],
                    "result_full": json.dumps(
                        {
                            "messages": [item.model_dump() for item in req.messages],
                            "assistant_text": "\n\n".join(assistant_text_parts),
                            "tool_calls": tool_records,
                            "ui_elements": ui_elements,
                            "provider_meta": provider_meta,
                        },
                        ensure_ascii=False,
                    ),
                    "created_at": datetime.now(timezone.utc),
                }
                if expires_at is not None:
                    doc["expires_at"] = expires_at
                await db.sub4_generation_history.insert_one(doc)
            except Exception:
                logger.warning("Failed to save diagram assistant history", exc_info=True)

            yield SSE_DONE
        except Exception as exc:  # noqa: BLE001
            logger.exception("Diagram assistant stream failed")
            yield sse_error(str(exc))
            yield SSE_DONE

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
