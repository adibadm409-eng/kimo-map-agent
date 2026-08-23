"""Shared data types used across the engine."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Optional


def parse_tool_args(raw: Any) -> Any:
    """Parse a model-supplied tool argument block.

    Accepts already-decoded objects or a JSON string (possibly wrapped in
    markdown fences / stray prose, which some models emit).
    """
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, list):
        return raw
    if not isinstance(raw, str):
        return raw
    s = raw.strip()
    if not s:
        return {}
    # Strip markdown code fences if present.
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", s, re.DOTALL)
    if fence:
        s = fence.group(1).strip()
    try:
        return json.loads(s)
    except (json.JSONDecodeError, ValueError):
        pass
    # Try to recover the first balanced {...} or [...] block.
    for opener, closer in (("{", "}"), ("[", "]")):
        start = s.find(opener)
        if start == -1:
            continue
        depth = 0
        for i in range(start, len(s)):
            if s[i] == opener:
                depth += 1
            elif s[i] == closer:
                depth -= 1
                if depth == 0:
                    candidate = s[start : i + 1]
                    try:
                        return json.loads(candidate)
                    except (json.JSONDecodeError, ValueError):
                        break
    return {}


def _coerce_text(content: Any) -> str:
    """Best-effort string extraction from an assistant message content."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict):
                if item.get("type") == "text":
                    parts.append(str(item.get("text", "")))
                elif "text" in item:
                    parts.append(str(item.get("text", "")))
            else:
                parts.append(str(item))
        return "\n".join(p for p in parts if p)
    return str(content)


@dataclass
class ChatMessage:
    """A single message in the model thread (mirrors the TS ChatMessage)."""

    role: str  # "system" | "user" | "assistant" | "tool"
    content: Any = None
    tool_calls: list[Any] = field(default_factory=list)
    tool_call_id: Optional[str] = None
    name: Optional[str] = None
    tool_error: bool = False

    @property
    def text(self) -> str:
        return _coerce_text(self.content)


@dataclass
class ToolCall:
    """A tool invocation requested by the model."""

    id: str
    name: str
    arguments: str  # JSON string

    def parsed_args(self) -> Any:
        return parse_tool_args(self.arguments)


@dataclass
class FunctionDef:
    """Tool/function schema sent to the model (OpenAI-style)."""

    name: str
    description: str
    parameters: dict[str, Any]

    def to_wire(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


@dataclass
class ChatResult:
    """Result of a single model call."""

    content: Optional[str]
    tool_calls: list[ToolCall]
    raw: Any = None


@dataclass
class ToolResult:
    """Outcome returned from executing a tool."""

    ok: bool
    data: Any = None
    error: Optional[str] = None
    observation: Optional[str] = None
    verified: Optional[bool] = None

    def to_observation(self) -> str:
        if self.observation is not None:
            return str(self.observation)
        if self.ok:
            try:
                return json.dumps(self.data, ensure_ascii=False, default=str)
            except (TypeError, ValueError):
                return str(self.data)
        return f"[فشل] {self.error or 'unknown error'}"


@dataclass
class EngineEvent:
    """Event emitted during a run (mirrors ``assistant/runtimeEvents.ts``)."""

    type: str  # thinking | stream | text | progress | error | phase | skill | plan | observation | decision | recovery | done
    content: Optional[str] = None
    done: bool = False
    detail: Optional[str] = None
    message: Optional[str] = None
    label: Optional[str] = None
    phase: Optional[str] = None
    status: Optional[str] = None
    strategy: Optional[str] = None
    skill: Any = None
    plan: Any = None
    title: Optional[str] = None
    outcome: Any = None
    payload: dict[str, Any] = field(default_factory=dict)

