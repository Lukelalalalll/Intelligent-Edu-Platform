from __future__ import annotations

import math
import os
from collections import Counter

_BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

SENSITIVE_ENVS: tuple[str, ...] = ("production", "prod", "staging", "preprod")


def is_sensitive_env(env: str) -> bool:
    return str(env or "").lower() in SENSITIVE_ENVS


def shannon_entropy_per_char(value: str) -> float:
    if not value:
        return 0.0
    counts = Counter(value)
    length = len(value)
    entropy = 0.0
    for count in counts.values():
        probability = count / length
        entropy -= probability * math.log2(probability)
    return entropy


def key_strength_issues(key_value: str, key_name: str) -> list[str]:
    value = str(key_value or "")
    lowered = value.lower()
    issues: list[str] = []
    weak_markers = {
        "your-secret-key",
        "jwt-secret-key-change-this-in-prod",
        "change-this",
        "secret",
        "default",
        "password",
    }
    if not value.strip():
        issues.append(f"{key_name} is empty")
        return issues
    if len(value) < 32:
        issues.append(f"{key_name} length must be >= 32")
    classes = 0
    classes += 1 if any(char.islower() for char in value) else 0
    classes += 1 if any(char.isupper() for char in value) else 0
    classes += 1 if any(char.isdigit() for char in value) else 0
    classes += 1 if any(not char.isalnum() for char in value) else 0
    if classes < 3:
        issues.append(f"{key_name} must include at least 3 character classes")
    entropy = shannon_entropy_per_char(value)
    if entropy < 3.0:
        issues.append(f"{key_name} entropy too low ({entropy:.2f} bits/char)")
    if lowered in weak_markers or any(marker in lowered for marker in weak_markers):
        issues.append(f"{key_name} appears to use a weak/default pattern")
    return issues
