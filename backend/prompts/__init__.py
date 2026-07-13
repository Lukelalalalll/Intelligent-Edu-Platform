"""
Prompt Registry — Load and manage versioned prompt templates from YAML files.

Usage:
    from backend.prompts import prompt_registry

    prompt = prompt_registry.get("grading", "feedback")
    rendered = prompt_registry.render("grading", "feedback", assignment_desc="...", ...)
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).parent


class PromptRegistry:
    """Loads prompt templates from YAML files and provides rendering."""

    def __init__(self, prompts_dir: Path | None = None):
        self._dir = prompts_dir or PROMPTS_DIR
        self._cache: dict[str, dict[str, Any]] = {}
        self._load_all()

    def _load_all(self) -> None:
        for yaml_path in sorted(self._dir.glob("*.yaml")):
            domain = yaml_path.stem
            try:
                data = yaml.safe_load(yaml_path.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    self._cache[domain] = data
                    logger.info("Loaded %d prompts from %s", len(data), yaml_path.name)
            except Exception:
                logger.exception("Failed to load prompt file %s", yaml_path.name)

    def reload(self) -> None:
        """Reload all prompt files from disk."""
        self._cache.clear()
        self._load_all()

    def get(self, domain: str, name: str) -> str:
        """Get raw template string for a prompt."""
        domain_prompts = self._cache.get(domain, {})
        prompt_def = domain_prompts.get(name)
        if not prompt_def:
            raise KeyError(f"Prompt '{domain}.{name}' not found")
        if isinstance(prompt_def, dict):
            return prompt_def.get("template", "")
        return str(prompt_def)

    def render(self, domain: str, name: str, **kwargs: Any) -> str:
        """Get and render a prompt template with the given variables."""
        template = self.get(domain, name)
        try:
            return template.format(**kwargs)
        except KeyError as exc:
            logger.warning("Missing template variable in %s.%s: %s", domain, name, exc)
            # Fallback: partial rendering
            for key, value in kwargs.items():
                template = template.replace(f"{{{key}}}", str(value))
            return template

    def get_version(self, domain: str, name: str) -> str:
        """Get the version string for a prompt."""
        domain_prompts = self._cache.get(domain, {})
        prompt_def = domain_prompts.get(name, {})
        if isinstance(prompt_def, dict):
            return str(prompt_def.get("version", "unknown"))
        return "unknown"

    def list_domains(self) -> list[str]:
        """List all available prompt domains."""
        return list(self._cache.keys())

    def list_prompts(self, domain: str) -> list[str]:
        """List all prompt names in a domain."""
        return list(self._cache.get(domain, {}).keys())


# Singleton instance
prompt_registry = PromptRegistry()
