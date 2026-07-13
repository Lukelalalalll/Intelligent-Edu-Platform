"""Document processing helpers: content density detection for adaptive chunk sizing."""

import re as _re


def detect_content_density(text: str) -> str:
    """Detect if a document is math/code-heavy to use larger chunks."""
    math_hits = len(_re.findall(r'[$\\∫∑∏∂∇]|\d+\.\d+|[=<>]{2,}', text[:10000]))
    ratio = math_hits / max(len(text[:10000]), 1)
    if ratio > 0.02:
        return "math_heavy"
    return "normal"
