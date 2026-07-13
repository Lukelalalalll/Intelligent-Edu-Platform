from __future__ import annotations

import copy
import json
import secrets
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlencode, urlsplit, urlunsplit

import httpx
import websocket

from backend.config import Config


IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}


class ComfyUIWanVideoAdapter:
    def __init__(self) -> None:
        self.base_url = str(Config.COMFYUI_BASE_URL or "http://127.0.0.1:8188").rstrip("/")
        self.workflow_path = Path(
            str(Config.COMFYUI_WORKFLOW_PATH or (Path(Config.BASE_DIR) / "workflows" / "text_to_video_wan.json"))
        )
        self.default_negative_prompt = str(Config.COMFYUI_DEFAULT_NEGATIVE_PROMPT or "").strip()
        self.timeout_seconds = max(60, int(getattr(Config, "COMFYUI_TIMEOUT_SECONDS", 1800) or 1800))
        self.poll_interval_seconds = max(0.5, float(getattr(Config, "COMFYUI_POLL_INTERVAL_SECONDS", 5.0) or 5.0))
        self.default_width = max(64, int(getattr(Config, "VIDEO_DEFAULT_WIDTH", 832) or 832))
        self.default_height = max(64, int(getattr(Config, "VIDEO_DEFAULT_HEIGHT", 480) or 480))
        self.default_fps = max(1, int(getattr(Config, "VIDEO_DEFAULT_FPS", 16) or 16))

    def render_broll_to_file(
        self,
        *,
        prompt: str,
        duration_seconds: int,
        output_path: str | Path,
        negative_prompt: str | None = None,
        width: int | None = None,
        height: int | None = None,
        fps: int | None = None,
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        workflow = self._load_workflow()
        output = Path(output_path)
        output.parent.mkdir(parents=True, exist_ok=True)

        resolved_width = max(64, int(width or self.default_width))
        resolved_height = max(64, int(height or self.default_height))
        resolved_fps = max(1, int(fps or self.default_fps))
        frames = max(1, int(duration_seconds) * resolved_fps + 1)
        seed = secrets.randbelow(2_147_483_647) + 1
        compiled_prompt = self._compile_workflow(
            workflow,
            prompt=prompt,
            negative_prompt=negative_prompt or self.default_negative_prompt,
            width=resolved_width,
            height=resolved_height,
            fps=resolved_fps,
            frames=frames,
            seed=seed,
            output_prefix=output.stem,
        )

        client_id = uuid.uuid4().hex
        progress_ws = self._connect_progress_ws(client_id) if progress_callback is not None else None
        try:
            prompt_id = self._submit_prompt(compiled_prompt, client_id=client_id)
            history = self._wait_for_history(
                prompt_id,
                ws=progress_ws,
                progress_callback=progress_callback,
            )
        finally:
            if progress_ws is not None:
                try:
                    progress_ws.close()
                except Exception:
                    pass
        asset = self._select_asset(history)
        download_path = output.with_suffix(Path(asset["filename"]).suffix or output.suffix or ".mp4")
        downloaded_asset = self._download_asset(asset, download_path)
        final_path = downloaded_asset
        if downloaded_asset.suffix.lower() in IMAGE_SUFFIXES:
            final_path = self._still_image_to_video(
                downloaded_asset,
                output,
                duration_seconds=duration_seconds,
                fps=resolved_fps,
                width=resolved_width,
                height=resolved_height,
            )

        return {
            "provider": "comfyui",
            "workflow_name": "text_to_video_wan",
            "prompt_id": prompt_id,
            "asset": asset,
            "history": history,
            "output_path": str(final_path),
            "request": {
                "prompt": prompt,
                "negative_prompt": negative_prompt or self.default_negative_prompt,
                "width": resolved_width,
                "height": resolved_height,
                "fps": resolved_fps,
                "frames": frames,
                "seed": seed,
            },
        }

    def _load_workflow(self) -> dict[str, Any]:
        if not self.workflow_path.exists():
            raise RuntimeError(f"ComfyUI workflow file not found: {self.workflow_path}")
        payload = json.loads(self.workflow_path.read_text(encoding="utf-8"))
        if isinstance(payload, dict) and isinstance(payload.get("prompt"), dict):
            return payload["prompt"]
        if not isinstance(payload, dict):
            raise RuntimeError(f"ComfyUI workflow must be a JSON object: {self.workflow_path}")
        return payload

    def _compile_workflow(
        self,
        workflow: dict[str, Any],
        *,
        prompt: str,
        negative_prompt: str,
        width: int,
        height: int,
        fps: int,
        frames: int,
        seed: int,
        output_prefix: str,
    ) -> dict[str, Any]:
        compiled = copy.deepcopy(workflow)
        values = {
            "__PROMPT__": prompt,
            "__NEGATIVE_PROMPT__": negative_prompt,
            "__WIDTH__": width,
            "__HEIGHT__": height,
            "__FPS__": fps,
            "__FRAMES__": frames,
            "__SEED__": seed,
            "__OUTPUT_PREFIX__": output_prefix,
        }
        compiled = self._replace_placeholders(compiled, values)

        for node in compiled.values():
            if not isinstance(node, dict):
                continue
            inputs = node.get("inputs")
            if not isinstance(inputs, dict):
                continue
            title = str(node.get("_meta", {}).get("title") or "").lower()
            class_type = str(node.get("class_type") or "").lower()

            if "positive prompt" in title and isinstance(inputs.get("text"), str):
                inputs["text"] = prompt
            elif "negative prompt" in title and isinstance(inputs.get("text"), str):
                inputs["text"] = negative_prompt

            if class_type == "emptyhunyuanlatentvideo":
                inputs["width"] = width
                inputs["height"] = height
                inputs["length"] = frames
            elif class_type == "createvideo":
                if "fps" in inputs:
                    inputs["fps"] = fps
            elif class_type == "ksampler":
                if "seed" in inputs:
                    inputs["seed"] = seed
            elif class_type == "savevideo":
                if "filename_prefix" in inputs:
                    inputs["filename_prefix"] = output_prefix

        return compiled

    def _submit_prompt(self, prompt: dict[str, Any], *, client_id: str) -> str:
        payload = {"prompt": prompt, "client_id": client_id}
        with httpx.Client(timeout=60) as client:
            response = client.post(f"{self.base_url}/prompt", json=payload)
            response.raise_for_status()
            data = response.json()
        prompt_id = data.get("prompt_id")
        if isinstance(prompt_id, str) and prompt_id:
            return prompt_id
        raise RuntimeError(
            f"ComfyUI rejected workflow submission: error={data.get('error')!r}, node_errors={data.get('node_errors')!r}"
        )

    def _connect_progress_ws(self, client_id: str):
        parsed = urlsplit(self.base_url)
        scheme = "wss" if parsed.scheme == "https" else "ws"
        ws_url = urlunsplit(
            (
                scheme,
                parsed.netloc,
                "/ws",
                urlencode({"clientId": client_id}),
                "",
            )
        )
        connection = websocket.create_connection(
            ws_url,
            timeout=max(1.0, min(10.0, self.poll_interval_seconds)),
            enable_multithread=True,
        )
        connection.settimeout(0.5)
        return connection

    def _wait_for_history(
        self,
        prompt_id: str,
        *,
        ws=None,
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        deadline = time.time() + self.timeout_seconds
        history_url = f"{self.base_url}/history/{prompt_id}"
        last_poll_at = 0.0

        with httpx.Client(timeout=60) as client:
            while time.time() < deadline:
                if ws is not None:
                    try:
                        message = ws.recv()
                    except websocket.WebSocketTimeoutException:
                        message = None
                    except Exception:
                        ws = None
                        message = None
                    if message is not None:
                        progress_update = self._parse_progress_message(message, prompt_id)
                        if progress_update and progress_callback is not None:
                            progress_callback(progress_update)

                now = time.time()
                if last_poll_at == 0.0 or (now - last_poll_at) >= self.poll_interval_seconds:
                    response = client.get(history_url)
                    response.raise_for_status()
                    data = response.json()
                    if isinstance(data, dict) and prompt_id in data:
                        entry = data[prompt_id]
                        if isinstance(entry, dict) and entry.get("outputs"):
                            return entry
                        status = entry.get("status", {}) if isinstance(entry, dict) else {}
                        if status.get("status_str") in {"error", "failed"}:
                            raise RuntimeError(f"ComfyUI execution failed: {entry}")
                    last_poll_at = now

                if ws is None:
                    time.sleep(min(0.5, self.poll_interval_seconds))

        raise TimeoutError(f"ComfyUI workflow timed out after {self.timeout_seconds} seconds: {prompt_id}")

    def _parse_progress_message(self, message: Any, prompt_id: str) -> dict[str, Any] | None:
        if not isinstance(message, str):
            return None
        try:
            payload = json.loads(message)
        except json.JSONDecodeError:
            return None
        if not isinstance(payload, dict):
            return None
        message_type = str(payload.get("type") or "")
        data = payload.get("data")
        if not isinstance(data, dict):
            return None

        if message_type == "progress" and str(data.get("prompt_id") or "") == prompt_id:
            value = float(data.get("value") or 0)
            max_value = float(data.get("max") or 0)
            percent = 0 if max_value <= 0 else max(0, min(100, int(round((value / max_value) * 100))))
            return {
                "source": "progress",
                "prompt_id": prompt_id,
                "node": str(data.get("node") or ""),
                "value": value,
                "max": max_value,
                "progress_percent": percent,
            }

        if message_type == "progress_state" and str(data.get("prompt_id") or "") == prompt_id:
            nodes = data.get("nodes")
            if not isinstance(nodes, dict) or not nodes:
                return None
            running_ratios: list[float] = []
            fallback_ratios: list[float] = []
            active_node = ""
            for node_id, state in nodes.items():
                if not isinstance(state, dict):
                    continue
                max_value = float(state.get("max") or 0)
                value = float(state.get("value") or 0)
                if max_value <= 0:
                    continue
                ratio = max(0.0, min(1.0, value / max_value))
                state_name = str(state.get("state") or "")
                if state_name == "running":
                    running_ratios.append(ratio)
                    active_node = str(node_id)
                else:
                    fallback_ratios.append(ratio)
                    if not active_node:
                        active_node = str(node_id)
            if not running_ratios and not fallback_ratios:
                return None
            ratio = max(running_ratios or fallback_ratios)
            return {
                "source": "progress_state",
                "prompt_id": prompt_id,
                "node": active_node,
                "progress_percent": max(0, min(100, int(round(ratio * 100)))),
            }

        return None

    def _download_asset(self, asset: dict[str, str], destination: Path) -> Path:
        params = {
            "filename": asset["filename"],
            "subfolder": asset.get("subfolder", ""),
            "type": asset.get("type", "output"),
        }
        with httpx.Client(timeout=300, follow_redirects=True) as client:
            response = client.get(f"{self.base_url}/view", params=params)
            response.raise_for_status()
            destination.write_bytes(response.content)
        return destination

    def _select_asset(self, history: dict[str, Any]) -> dict[str, str]:
        outputs = history.get("outputs")
        if not isinstance(outputs, dict):
            raise RuntimeError(f"ComfyUI history did not contain outputs: {history}")

        candidates: list[dict[str, str]] = []
        for node_output in outputs.values():
            if not isinstance(node_output, dict):
                continue
            for key in ("gifs", "videos", "images"):
                items = node_output.get(key)
                if not isinstance(items, list):
                    continue
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    filename = item.get("filename")
                    if not isinstance(filename, str) or not filename:
                        continue
                    candidates.append(
                        {
                            "filename": filename,
                            "subfolder": str(item.get("subfolder", "")),
                            "type": str(item.get("type", "output")),
                        }
                    )

        if not candidates:
            raise RuntimeError(f"ComfyUI workflow finished without downloadable outputs: {history}")

        preferred_suffixes = (".mp4", ".mov", ".webm", ".mkv", ".avi", ".gif", ".webp")
        for suffix in preferred_suffixes:
            for candidate in candidates:
                if candidate["filename"].lower().endswith(suffix):
                    return candidate
        return candidates[0]

    def _replace_placeholders(self, payload: Any, values: dict[str, Any]) -> Any:
        if isinstance(payload, dict):
            return {key: self._replace_placeholders(value, values) for key, value in payload.items()}
        if isinstance(payload, list):
            return [self._replace_placeholders(item, values) for item in payload]
        if isinstance(payload, str):
            if payload in values:
                return values[payload]
            result = payload
            for token, replacement in values.items():
                result = result.replace(token, str(replacement))
            return result
        return payload

    def _still_image_to_video(
        self,
        image_path: Path,
        output_path: Path,
        *,
        duration_seconds: int,
        fps: int,
        width: int,
        height: int,
    ) -> Path:
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-loop", "1",
                "-framerate", str(fps),
                "-t", str(max(1, duration_seconds)),
                "-i", str(image_path),
                "-vf", (
                    f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
                    f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1"
                ),
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                "-loglevel", "error",
                str(output_path),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=600,
        )
        return output_path
