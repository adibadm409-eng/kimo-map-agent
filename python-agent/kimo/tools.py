"""Tool registry, schema validation and execution (mirrors
``agent/registry.ts`` + ``assistant/toolValidation.ts`` + ``assistant/invokeTools.ts``).

A tool is declared once with a :class:`ToolDef`. The engine validates every
model-requested call against that schema *before* executing it — this is the
local guardrail that stops malformed or unknown tool calls from ever touching
the data layer.
"""

from __future__ import annotations

import inspect
import json
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Optional, Protocol, runtime_checkable

from .types import ToolCall, ToolResult, parse_tool_args

JSON_TYPES = {
    "string": str,
    "number": (int, float),
    "integer": int,
    "boolean": bool,
    "object": dict,
    "array": list,
    "null": type(None),
}


@dataclass
class ToolArg:
    name: str
    type: str = "string"  # JSON-schema primitive
    description: str = ""
    required: bool = False
    enum: Optional[list[Any]] = None
    default: Any = None
    items: Optional["ToolArg"] = None

    def to_schema(self) -> dict[str, Any]:
        schema: dict[str, Any] = {"type": self.type, "description": self.description}
        if self.enum is not None:
            schema["enum"] = self.enum
        if self.type == "array" and self.items is not None:
            schema["items"] = self.items.to_schema()
        return schema


@dataclass
class ToolDef:
    name: str
    description: str
    args: list[ToolArg] = field(default_factory=list)
    handler: Optional[Callable[[dict, Any], Any]] = None
    read_only: bool = True
    category: str = "generic"
    verification: bool = False

    def parameters_schema(self) -> dict[str, Any]:
        props = {a.name: a.to_schema() for a in self.args}
        required = [a.name for a in self.args if a.required]
        return {
            "type": "object",
            "properties": props,
            "required": required,
            "additionalProperties": False,
        }

    def function_def(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters_schema(),
            },
        }


# --- validation -------------------------------------------------------------


def _matches_type(value: Any, js_type: str) -> bool:
    if js_type == "number":
        if isinstance(value, bool):
            return False
        return isinstance(value, (int, float))
    if js_type == "integer":
        if isinstance(value, bool):
            return False
        return isinstance(value, int)
    if js_type == "string":
        return isinstance(value, str)
    if js_type == "boolean":
        return isinstance(value, bool)
    if js_type == "object":
        return isinstance(value, dict)
    if js_type == "array":
        return isinstance(value, list)
    if js_type == "null":
        return value is None
    return True


@dataclass
class Issue:
    message: str


def coerce_args(tool: ToolDef, args: Any) -> Any:
    """Best-effort coercion so small model slips don't fail validation.

    * fills defaults for missing optional args;
    * parses ``"123"`` -> 123 / ``"true"`` -> True when the schema expects a
      number / integer / boolean;
    * keeps arrays/objects untouched.
    """
    if not isinstance(args, dict):
        return args
    out = dict(args)
    for arg in tool.args:
        present = arg.name in out
        value = out.get(arg.name, None)
        if not present:
            if arg.default is not None:
                out[arg.name] = arg.default
            continue
        if value is None:
            if arg.default is not None:
                out[arg.name] = arg.default
            continue
        if arg.type in ("number", "integer") and isinstance(value, str):
            try:
                out[arg.name] = int(value) if arg.type == "integer" else float(value)
            except ValueError:
                pass
        elif arg.type == "boolean" and isinstance(value, str):
            if value.lower() in ("true", "1", "yes"):
                out[arg.name] = True
            elif value.lower() in ("false", "0", "no", ""):
                out[arg.name] = False
    return out


def validate_args(tool: ToolDef, args: Any) -> list[Issue]:
    """Validate a decoded argument value against a tool definition."""
    if not isinstance(args, dict):
        return [Issue(f"الأداة «{tool.name}» تتوقع كائناً للوسائط، استلمت {type(args).__name__}.")]

    args = coerce_args(tool, args)

    if not tool.args:
        return []

    issues: list[Issue] = []
    for arg in tool.args:
        present = arg.name in args
        value = args.get(arg.name, arg.default)
        if not present:
            if arg.required:
                issues.append(Issue(f"وسيطة مفقودة: «{arg.name}» مطلوبة للأداة «{tool.name}»."))
            continue
        if value is None and not arg.required:
            continue
        if arg.type != "any" and not _matches_type(value, arg.type):
            issues.append(
                Issue(f"الوسيطة «{arg.name}» من النوع {arg.type} لكن استلمت {type(value).__name__}.")
            )
            continue
        if arg.enum is not None and value not in arg.enum:
            issues.append(Issue(f"الوسيطة «{arg.name}» يجب أن تكون واحدة من {arg.enum}."))
    return issues


def validate_tool_call(tool: ToolDef, call: ToolCall) -> list[Issue]:
    try:
        args = parse_tool_args(call.arguments)
    except Exception:  # pragma: no cover
        args = {}
    return validate_args(tool, args)


# --- backend + registry ------------------------------------------------------


@runtime_checkable
class ToolBackend(Protocol):
    """A pluggable executor for tool names.

    Implement this to wire the engine to a real data source (SQLite, an API,
    a sandboxed process...). The default :class:`Registry` runs in-process
    handlers.
    """

    async def run_tool(self, name: str, args: dict[str, Any], ctx: Any) -> ToolResult:
        ...


class Registry:
    """Holds tool definitions and validates/executes them safely."""

    def __init__(self) -> None:
        self._tools: dict[str, ToolDef] = {}
        self._backend: Optional[ToolBackend] = None

    def register(self, tool: ToolDef) -> ToolDef:
        self._tools[tool.name] = tool
        return tool

    def register_handler(
        self,
        name: str,
        description: str,
        args: list[ToolArg],
        handler: Callable[[dict, Any], Any],
        *,
        read_only: bool = True,
        category: str = "generic",
        verification: bool = False,
    ) -> ToolDef:
        return self.register(
            ToolDef(
                name=name,
                description=description,
                args=args,
                handler=handler,
                read_only=read_only,
                category=category,
                verification=verification,
            )
        )

    def set_backend(self, backend: ToolBackend) -> None:
        self._backend = backend

    def get(self, name: str) -> Optional[ToolDef]:
        return self._tools.get(name)

    def names(self) -> list[str]:
        return list(self._tools.keys())

    def function_defs(self) -> list[dict[str, Any]]:
        return [t.function_def() for t in self._tools.values()]

    # Validation used by the loop before execution.
    def validate(self, call: ToolCall, parallel: bool = True) -> list[Issue]:
        tool = self.get(call.name)
        if not tool:
            return [Issue(f"الأداة غير معروفة: {call.name}.")]
        return validate_tool_call(tool, call)

    def validate_batch(self, calls: list[ToolCall], parallel: bool = True) -> list[Issue]:
        issues: list[Issue] = []
        for call in calls:
            issues.extend(self.validate(call, parallel))
        return issues

    async def execute(self, call: ToolCall, ctx: Any) -> ToolResult:
        """Validate then run a single tool call; never raises on bad input."""
        tool = self.get(call.name)
        if not tool:
            return ToolResult(ok=False, error="unknown_tool", observation=f"[فشل التحقق قبل التنفيذ] الأداة غير معروفة: {call.name}.")
        args = parse_tool_args(call.arguments)
        issues = validate_args(tool, args)
        if issues:
            detail = " ".join(i.message for i in issues)
            return ToolResult(ok=False, error="tool_validation", observation=f"[فشل التحقق قبل التنفيذ] {detail}")

        # Route through a backend if one is configured, else run the handler.
        if self._backend is not None:
            try:
                return await self._backend.run_tool(call.name, args, ctx)
            except Exception as e:  # backend failures become a tool error
                return ToolResult(ok=False, error="backend_error", observation=f"[فشل] خطأ في الواجهة الخلفية: {e}")

        if tool.handler is None:
            return ToolResult(ok=False, error="no_handler", observation=f"[فشل] لا يوجد معالج للأداة «{call.name}».")

        try:
            result = tool.handler(args, ctx)
            if inspect.isawaitable(result):
                result = await result
        except Exception as e:  # never let a tool crash the loop
            return ToolResult(ok=False, error="tool_execution_exception", observation=f"[فشل/غير مؤكد] تعذر تنفيذ «{call.name}»: {e}.")

        if isinstance(result, ToolResult):
            return result
        if isinstance(result, dict) and ("ok" in result or "data" in result or "error" in result):
            return ToolResult(
                ok=bool(result.get("ok", True)),
                data=result.get("data"),
                error=result.get("error"),
                observation=result.get("observation"),
                verified=result.get("verified"),
            )
        return ToolResult(ok=True, data=result, observation=json.dumps(result, ensure_ascii=False, default=str))


def tool_sig(call: ToolCall) -> str:
    """Stable signature for repeat-detection (mirrors ``undo.toolSig``)."""
    name = call.name
    if call.name == "execute":
        inner = parse_tool_args(call.arguments) or {}
        name = f"execute:{inner.get('tool', 'execute')}"
    return f"{name}:{call.arguments}"
