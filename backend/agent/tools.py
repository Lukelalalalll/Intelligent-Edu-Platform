"""Enhanced ToolRegistry with full JSON Schema support via Pydantic models."""

import json
import inspect
from typing import Any, Callable, Dict, List, Optional, get_type_hints

try:
    from pydantic import BaseModel
except ImportError:
    BaseModel = None  # type: ignore[assignment]


_TYPE_MAP = {
    int: "integer",
    float: "number",
    bool: "boolean",
    str: "string",
    list: "array",
    dict: "object",
}


def _infer_json_type(annotation: Any) -> Optional[str]:
    """Infer the JSON Schema type from a Python type annotation."""
    origin = getattr(annotation, "__origin__", None)
    if origin is list or origin is set:
        return "array"
    if origin is dict:
        return "object"
    return _TYPE_MAP.get(annotation)


def _annotation_to_schema(annotation: Any) -> Dict:
    """Recursively build a JSON Schema from a type annotation."""
    if BaseModel and isinstance(annotation, type) and issubclass(annotation, BaseModel):
        return _pydantic_to_schema(annotation)

    json_type = _infer_json_type(annotation)
    if json_type == "array":
        args = getattr(annotation, "__args__", None)
        item_schema = _annotation_to_schema(args[0]) if args else {"type": "string"}
        return {"type": "array", "items": item_schema}
    if json_type:
        return {"type": json_type}
    if isinstance(annotation, type) and hasattr(annotation, "__enum_members__"):
        return {"type": "string", "enum": list(annotation.__enum_members__.keys())}
    # fallback
    return {"type": "string"}


def _pydantic_to_schema(model_cls) -> Dict:
    """Generate JSON Schema from a Pydantic v1 model's schema() method."""
    if hasattr(model_cls, "schema"):
        full_schema = model_cls.schema()
        # Extract just the properties/required from the top-level schema
        return {
            "type": "object",
            "properties": full_schema.get("properties", {}),
            "required": full_schema.get("required", []),
        }
    # Fallback: iterate over fields manually
    props = {}
    required = []
    for name, field in model_cls.__fields__.items():
        field_type = field.outer_type_ or field.annotation
        props[name] = {
            "description": field.field_info.description or f"Parameter {name}",
            **_annotation_to_schema(field_type),
        }
        # For enums on fields
        if hasattr(field_type, "__enum_members__"):
            props[name]["enum"] = list(field_type.__enum_members__.keys())
        if field.required:
            required.append(name)
    return {
        "type": "object",
        "properties": props,
        "required": required,
    }


def _signature_to_schema(func: Callable, description: str, name_hint: str) -> Dict:
    """Build a tool function schema from the function signature and type hints."""
    sig = inspect.signature(func)
    hints = get_type_hints(func) if func.__code__.co_varnames else {}
    properties = {}
    required = []

    for param_name, param in sig.parameters.items():
        hint = hints.get(param_name)
        if hint:
            prop_schema = _annotation_to_schema(hint)
        else:
            json_type = _TYPE_MAP.get(param.annotation, "string") if param.annotation != inspect.Parameter.empty else "string"
            prop_schema = {"type": json_type}

        if "description" not in prop_schema:
            prop_schema["description"] = f"Parameter {param_name}"

        properties[param_name] = prop_schema

        if param.default == inspect.Parameter.empty and param.kind not in (
            inspect.Parameter.VAR_POSITIONAL,
            inspect.Parameter.VAR_KEYWORD,
        ):
            required.append(param_name)

    return {
        "type": "function",
        "function": {
            "name": name_hint,
            "description": (description or "").strip(),
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required,
            },
        },
    }


class ToolRegistry:
    """Registry for AI Agent tools with full JSON Schema support."""

    def __init__(self):
        self._tools: Dict[str, Callable] = {}
        self._schemas: Dict[str, Dict] = {}

    def register(
        self,
        func: Optional[Callable] = None,
        *,
        name: Optional[str] = None,
        description: Optional[str] = None,
    ):
        """Register a function or Pydantic-based function as a tool.
        
        Can be used as a decorator with or without arguments::
        
            @tool_registry.register
            def my_tool(x: int) -> str: ...
            
            @tool_registry.register(name="custom_name", description="desc")
            def my_tool(x: int) -> str: ...
        """
        if func is None:

            def wrapper(fn: Callable):
                self.register(fn, name=name, description=description)
                return fn

            return wrapper

        tool_name = name or func.__name__
        tool_desc = description or (func.__doc__ or "No description provided.").strip()
        self._tools[tool_name] = func
        self._schemas[tool_name] = _signature_to_schema(func, tool_desc, tool_name)
        return func

    def get_schemas(self) -> List[Dict]:
        return list(self._schemas.values())

    async def execute(self, name: str, arguments: Dict) -> Any:
        """Execute a registered tool by name with the given arguments."""
        if name not in self._tools:
            raise ValueError(f"Tool {name} not found")

        func = self._tools[name]
        if inspect.iscoroutinefunction(func):
            return await func(**arguments)
        else:
            return func(**arguments)


tool_registry = ToolRegistry()