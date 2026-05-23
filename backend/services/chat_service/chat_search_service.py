import re

MAX_SEARCH_LENGTH = 40


def sanitize_user_search_query(raw_query: str) -> str:
    value = str(raw_query or "").strip()
    if not value:
        raise ValueError("Search keyword is required")

    if len(value) > MAX_SEARCH_LENGTH:
        raise ValueError(f"Search keyword too long (max {MAX_SEARCH_LENGTH})")

    # Collapse repeated whitespace and control chars to avoid pathological patterns.
    value = re.sub(r"\s+", " ", value)

    if len(value) < 1:
        raise ValueError("Search keyword is required")

    # Return escaped literal pattern to avoid regex injection / ReDoS.
    return re.escape(value)
