import asyncio
import json
import uuid

import aiohttp

from utils.get_env import get_comfyui_url_env, get_comfyui_workflow_env

from services.image_generation_service_support.comfyui_graph import (
    inject_prompt_into_workflow,
    inject_random_seeds_into_workflow,
)
from services.image_generation_service_support.common import save_image_bytes


class ComfyUIImageGenerationMixin:
    async def generate_image_comfyui(self, prompt: str, output_directory: str) -> str:
        comfyui_url = get_comfyui_url_env()
        workflow_json = get_comfyui_workflow_env()
        if not comfyui_url:
            raise ValueError("COMFYUI_URL environment variable is not set")
        if not workflow_json:
            raise ValueError(
                "COMFYUI_WORKFLOW environment variable is not set. Please provide a ComfyUI workflow JSON."
            )

        comfyui_url = comfyui_url.rstrip("/")
        try:
            workflow = json.loads(workflow_json)
        except json.JSONDecodeError as error:
            raise ValueError(f"Invalid workflow JSON: {str(error)}")

        workflow = inject_prompt_into_workflow(workflow, prompt)
        randomized_seed_count = inject_random_seeds_into_workflow(workflow)
        if randomized_seed_count:
            print(
                f"Randomized {randomized_seed_count} ComfyUI seed input(s) before submission"
            )

        async with aiohttp.ClientSession(trust_env=True) as session:
            prompt_id = await self._submit_comfyui_workflow(
                session,
                comfyui_url,
                workflow,
            )
            status_data = await self._wait_for_comfyui_completion(
                session,
                comfyui_url,
                prompt_id,
            )
            return await self._download_comfyui_image(
                session,
                comfyui_url,
                status_data,
                prompt_id,
                output_directory,
            )

    async def _submit_comfyui_workflow(
        self,
        session: aiohttp.ClientSession,
        comfyui_url: str,
        workflow: dict,
    ) -> str:
        payload = {"prompt": workflow, "client_id": str(uuid.uuid4())}
        response = await session.post(
            f"{comfyui_url}/prompt",
            json=payload,
            timeout=aiohttp.ClientTimeout(total=30),
        )
        if response.status != 200:
            error_text = await response.text()
            raise Exception(f"Failed to submit workflow to ComfyUI: {error_text}")
        data = await response.json()
        prompt_id = data.get("prompt_id")
        if not prompt_id:
            raise Exception("No prompt_id returned from ComfyUI")
        print(f"ComfyUI workflow submitted. Prompt ID: {prompt_id}")
        return prompt_id

    async def _wait_for_comfyui_completion(
        self,
        session: aiohttp.ClientSession,
        comfyui_url: str,
        prompt_id: str,
        timeout: int = 3000,
        poll_interval: int = 4,
    ) -> dict:
        start_time = asyncio.get_event_loop().time()
        while True:
            elapsed = asyncio.get_event_loop().time() - start_time
            if elapsed > timeout:
                raise Exception(f"ComfyUI workflow timed out after {timeout} seconds")
            await asyncio.sleep(poll_interval)
            response = await session.get(
                f"{comfyui_url}/history/{prompt_id}",
                timeout=aiohttp.ClientTimeout(total=30),
            )
            if response.status != 200:
                continue
            try:
                status_data = await response.json()
            except Exception:
                continue

            if prompt_id in status_data:
                execution_data = status_data[prompt_id]
                if "status" in execution_data:
                    status = execution_data["status"]
                    if status.get("completed", False):
                        print("ComfyUI workflow completed successfully")
                        return status_data
                    if "error" in status:
                        raise Exception(f"ComfyUI workflow error: {status['error']}")
                if "outputs" in execution_data and execution_data["outputs"]:
                    print("ComfyUI workflow completed (outputs found)")
                    return status_data
            print(f"Waiting for ComfyUI workflow... ({int(elapsed)}s)")

    async def _download_comfyui_image(
        self,
        session: aiohttp.ClientSession,
        comfyui_url: str,
        status_data: dict,
        prompt_id: str,
        output_directory: str,
    ) -> str:
        if prompt_id not in status_data:
            raise Exception("Prompt ID not found in status data")
        outputs = status_data[prompt_id].get("outputs", {})
        if not outputs:
            raise Exception("No outputs found in ComfyUI response")

        for _, node_output in outputs.items():
            if "images" not in node_output:
                continue
            for image_info in node_output["images"]:
                filename = image_info["filename"]
                subfolder = image_info.get("subfolder", "")
                params = {"filename": filename, "type": "output"}
                if subfolder:
                    params["subfolder"] = subfolder

                response = await session.get(
                    f"{comfyui_url}/view",
                    params=params,
                    timeout=aiohttp.ClientTimeout(total=60),
                )
                if response.status != 200:
                    raise Exception(f"Failed to download image: {response.status}")
                image_data = await response.read()
                extension = filename.split(".")[-1] if "." in filename else "png"
                image_path = save_image_bytes(
                    output_directory,
                    image_data,
                    extension=extension,
                )
                print(f"Downloaded image from ComfyUI: {image_path}")
                return image_path
        raise Exception("No downloadable image found in ComfyUI outputs")


__all__ = ["ComfyUIImageGenerationMixin"]
