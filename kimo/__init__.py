"""Kimo — a fast, accurate Python agent engine.

This package is a clean-room reimplementation of the Kimo agent runtime that
ships inside the Property Manager app, rebuilt to run on a powerful, flexible
Python engine instead of the JS/TS stack.

The architecture mirrors the original:

    engine.send_user_message(...)
            |
            v
        run_loop  (ReAct loop: think -> call tools -> observe -> repeat)
            |            |
            |            v
            |        provider.chat(...)   (OpenAI-compatible tool calling)
            |            |
            |            v
            |        tools.execute(...)   (validated tool + domain backend)
            v
        session store (messages, plans, evidence)

The domain-specific tools (SQLite-backed CRUD, project tree, analytics...) are
kept *behind* a pluggable ``ToolBackend`` so this engine stays portable and the
same runtime can drive any data source.
"""

from .engine import (
    AgentEngine,
    EngineEvent,
    SendOptions,
)
from .config import AgentSettings, ModelProfile, ProviderDef, resolve_profile
from .types import (
    ChatMessage,
    ChatResult,
    FunctionDef,
    ToolCall,
    ToolResult,
    parse_tool_args,
)
from .tools import ToolDef, ToolArg, Registry, ToolBackend
from .session import Message, SessionStore, MemorySessionStore
from .skills import AgentSkill, assess_skill, plan_for_skill
from .loop import run_loop

__all__ = [
    "AgentEngine",
    "EngineEvent",
    "SendOptions",
    "AgentSettings",
    "ModelProfile",
    "ProviderDef",
    "resolve_profile",
    "ChatMessage",
    "ChatResult",
    "FunctionDef",
    "ToolCall",
    "ToolResult",
    "parse_tool_args",
    "ToolDef",
    "ToolArg",
    "Registry",
    "ToolBackend",
    "Message",
    "SessionStore",
    "MemorySessionStore",
    "AgentSkill",
    "assess_skill",
    "plan_for_skill",
    "run_loop",
]
