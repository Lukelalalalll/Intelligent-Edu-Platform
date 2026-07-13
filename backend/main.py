"""Compatibility entrypoint for local runs.

The canonical core application now lives in ``backend.apps.core``.
Keep importing ``backend.main:app`` for backward compatibility while local
docs and tests converge on the app-factory based entrypoints.
"""
from backend.apps.core import app  # noqa: F401
