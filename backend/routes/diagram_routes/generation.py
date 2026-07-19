"""SVG diagram generation and text expansion endpoints."""
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, File, Form, HTTPException, UploadFile

from backend.core.ai_provider import resolve_provider_runtime
from backend.core.database import compute_history_expires_at, db
from backend.core.security import get_current_user
from backend.infrastructure import TelemetryTimer
from backend.services.ai_gateway_service import get_ai_gateway_service
from backend.services.visual.diagram_service import generate_svg_with_runtime
from .router import diagram_router

logger = logging.getLogger(__name__)


@diagram_router.post("/generate_diagram")
async def generate_diagram(
    promptFile: Optional[UploadFile] = File(None),
    promptText: str = Form(default=''),
    provider: str | None = Form(None),
    user: dict = Depends(get_current_user),
):
    """Generate SVG diagram from uploaded text file OR direct text input."""
    # Resolve prompt: file takes priority, then text field
    text = ''
    if promptFile and promptFile.filename:
        raw = await promptFile.read()
        text = raw.decode('utf-8', errors='replace').strip()
    if not text:
        text = (promptText or '').strip()
    if not text:
        raise HTTPException(status_code=400, detail="Please provide a text file or enter text content")

    try:
        runtime = await resolve_provider_runtime(
            provider or "auto",
            feature="diagram.generate_diagram",
            user=user,
            require_healthy=True,
        )
        ai_service = get_ai_gateway_service()

        timer = TelemetryTimer(
            provider=runtime.provider_id,
            model=runtime.model,
            endpoint="sub4/generate_diagram",
            api_type="chat",
            credential_alias="COZE_TOKEN" if runtime.provider_id == "coze" else "OLLAMA_BASE_URL",
        )
        try:
            with timer:
                result = await generate_svg_with_runtime(
                    text=text,
                    runtime=runtime,
                    user_id=str(user.get("id", "anon")),
                    ai_service=ai_service,
                )
            await timer.save(
                prompt_tokens=max(1, len(text) // 4),
                completion_tokens=max(1, len(result["svg"]) // 4),
            )
        except Exception as e:
            await timer.save(success=False, error=str(e))
            raise

        # Save to generation history
        try:
            _exp = await compute_history_expires_at(user.get("id", ""))
            _doc = {
                "user_id": user.get("id", ""),
                "params": {
                    "service_type": "generate",
                    "input_prompt": text[:200],
                    "provider": result["provider"],
                    "provider_source": result.get("provider_source"),
                    "requested_provider": result.get("requested_provider"),
                    "model": result.get("model"),
                    "draft_quality": result["draft_quality"],
                    "refined": result["refined"],
                    "fallback_used": result["fallback_used"],
                    "provider_switched": result["provider_switched"],
                },
                "source": {"prompt": text},
                "result_preview": f"Generated diagram ({result['provider']}, quality={result['draft_quality']}): {text[:100]}",
                "result_full": json.dumps({"svg": result["svg"], "meta": result}),
                "created_at": datetime.now(timezone.utc),
            }
            if _exp is not None:
                _doc["expires_at"] = _exp
            await db.sub4_generation_history.insert_one(_doc)
        except Exception:
            pass  # history save failure should not block the response

        return {
            "svg": result["svg"],
            "meta": {
                "provider": result["provider"],
                "provider_source": result.get("provider_source"),
                "requested_provider": result.get("requested_provider"),
                "model": result.get("model"),
                "draft_quality": result["draft_quality"],
                "refined": result["refined"],
                "fallback_used": result["fallback_used"],
                "provider_switched": result["provider_switched"],
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Diagram generation failed")
        raise HTTPException(status_code=500, detail=f"Diagram generation failed: {str(e)}")


@diagram_router.post("/coze_generate_text")
async def coze_generate_text(
    keywords: str = Form(...),
    provider: str | None = Form(None),
    user: dict = Depends(get_current_user),
):
    """Expand keywords into a diagram description with selectable provider."""
    keywords = keywords.strip()
    if not keywords:
        raise HTTPException(status_code=400, detail="Keywords are required")

    runtime = await resolve_provider_runtime(
        provider or "auto",
        feature="diagram.generate_text",
        user=user,
        require_healthy=True,
    )

    system_prompt = (
        "You are an expert educator and diagram designer. "
        "Given keywords or a topic, write a detailed English description (150-300 words) "
        "that can be used to generate an educational diagram. "
        "Include: the main components/nodes, their relationships/connections, "
        "hierarchy or flow direction, and any important labels. "
        "Be specific about structure (e.g., tree, flowchart, cycle, layered). "
        "Output ONLY the description text, no titles or formatting."
    )

    full_prompt = f"{system_prompt}\n\nKeywords/Topic: {keywords}"

    try:
        ai_service = get_ai_gateway_service()
        timer = TelemetryTimer(
            provider=runtime.provider_id,
            model=runtime.model,
            endpoint="sub4/coze_generate_text",
            api_type="chat",
            credential_alias="COZE_TOKEN" if runtime.provider_id == "coze" else "OLLAMA_BASE_URL",
        )
        with timer:
            answer = await ai_service.chat_with_runtime(
                message=full_prompt,
                context={"coze_user_id": f"sub4_{user.get('id', 'anon')}"},
                runtime=runtime,
            )
            await timer.save(
                success=True,
                prompt_tokens=max(1, len(keywords) // 3),
                completion_tokens=max(1, len(answer) // 3),
            )

        return {
            "text": answer.strip(),
            "meta": {
                "provider": runtime.provider_id,
                "provider_source": runtime.config_source,
                "requested_provider": runtime.requested_provider,
                "model": runtime.model,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Coze text generation failed")
        raise HTTPException(status_code=500, detail=f"Text generation failed: {str(e)}")
