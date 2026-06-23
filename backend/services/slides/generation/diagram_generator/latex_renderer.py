from __future__ import annotations

import re
import subprocess


def clean_latex_code(latex_code: str) -> str:
    return re.sub(r"\\documentclass.*?{.*?}", "", latex_code, flags=re.DOTALL)


def create_latex_document(tex_path: str, tikz_code: str) -> None:
    latex_template = f"""\\documentclass[border=1mm]{{standalone}}
{tikz_code}
"""
    with open(tex_path, "w", encoding="utf-8") as handle:
        handle.write(latex_template)


def compile_latex(filename: str, output_dir: str) -> bool:
    try:
        version_result = subprocess.run(
            ["pdflatex", "--version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if version_result.returncode != 0:
            print("pdflatex not available")
            return False
    except FileNotFoundError:
        print("pdflatex command not found")
        return False

    try:
        result = subprocess.run(
            ["pdflatex", "-interaction=nonstopmode", "-output-directory", output_dir, f"{filename}.tex"],
            cwd=output_dir,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=60,
        )
        if result.returncode != 0:
            print(f"LaTeX compilation failed, return code: {result.returncode}")
            return False
        return True
    except subprocess.TimeoutExpired:
        print("LaTeX compilation timeout")
        return False
    except Exception as exc:
        print(f"LaTeX compilation exception: {exc}")
        return False
