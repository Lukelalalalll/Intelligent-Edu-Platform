from __future__ import annotations

import os
import subprocess


def render_mermaid_to_image(mermaid_code: str, output_path: str) -> bool:
    try:
        mmd_path = output_path.replace(".png", ".mmd")
        with open(mmd_path, "w", encoding="utf-8") as handle:
            handle.write(mermaid_code)
        result = subprocess.run(
            ["mmdc", "-i", mmd_path, "-o", output_path, "-t", "default", "-b", "transparent"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            print(f"Mermaid rendering failed: {result.stderr}")
            return False
        return True
    except Exception as exc:
        print(f"Mermaid rendering exception: {exc}")
        return False
    finally:
        if "mmd_path" in locals() and os.path.exists(mmd_path):
            os.remove(mmd_path)
