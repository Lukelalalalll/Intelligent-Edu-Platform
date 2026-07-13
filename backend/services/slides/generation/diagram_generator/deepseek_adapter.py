from __future__ import annotations

from typing import Optional


def call_deepseek_for_tikz(session, api_key: str | None, prompt: str) -> Optional[str]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    chat_prompt = (
        f"Generate a complete LaTeX diagram using TikZ for: {prompt}. "
        "The code must be self-contained and include all necessary packages and libraries. "
        "Only return the code between ```latex and ```. "
        "Avoid overlapping text and graphical elements."
    )
    try:
        response = session.post(
            "https://api.deepseek.com/v1/chat/completions",
            json={
                "model": "deepseek-chat",
                "messages": [{"role": "user", "content": chat_prompt}],
                "temperature": 0.7,
            },
            headers=headers,
            timeout=60,
        )
        response.raise_for_status()
        payload = response.json()
        if "error" in payload:
            raise RuntimeError(payload["error"])
        latex_code = payload["choices"][0]["message"]["content"]
        if "```latex" in latex_code:
            latex_code = latex_code.split("```latex")[1].split("```")[0].strip()
        return latex_code
    except Exception as exc:
        print(f"DeepSeek API call failed: {exc}")
        return None


def generate_mermaid_code(session, api_key: str | None, prompt: str) -> Optional[str]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    mermaid_prompt = (
        f"Generate a mermaid diagram for: {prompt}. "
        "Use appropriate mermaid syntax and only return the mermaid code between ```mermaid and ```."
    )
    try:
        response = session.post(
            "https://api.deepseek.com/v1/chat/completions",
            json={
                "model": "deepseek-chat",
                "messages": [{"role": "user", "content": mermaid_prompt}],
                "temperature": 0.7,
            },
            headers=headers,
            timeout=60,
        )
        response.raise_for_status()
        payload = response.json()
        if "error" in payload:
            raise RuntimeError(payload["error"])
        mermaid_code = payload["choices"][0]["message"]["content"]
        if "```mermaid" in mermaid_code:
            mermaid_code = mermaid_code.split("```mermaid")[1].split("```")[0].strip()
        elif "```" in mermaid_code:
            mermaid_code = mermaid_code.split("```")[1].split("```")[0].strip()
        return mermaid_code
    except Exception as exc:
        print(f"Mermaid code generation failed: {exc}")
        return None
