"""Host glue — turns the Kimo engine into a runnable agent for the pulled
copy of the Property Manager app (python-agent).

This is the *actual* engine entrypoint that replaces the old TS runtime: it
wires :class:`AgentEngine` to the real domain via
:func:`kimo.integration.backend.build_integration_registry`.
"""

from __future__ import annotations

import os
from typing import Optional

from .config import AgentSettings, default_provider
from .config_store import resolve_settings
from .engine import AgentEngine
from .integration.backend import build_integration_registry
from .integration.store import SqliteStore
from .llm import ChatClient
from .tools import ToolDef


def build_agent(
    db_path: str = "kimo.db",
    settings: Optional[AgentSettings] = None,
    store: Optional[SqliteStore] = None,
) -> tuple[AgentEngine, SqliteStore]:
    """Create an agent whose tool surface *is* the real domain backend.

    The old TS engine (``reference/engine-preview``) is fully superseded: the
    model now talks to the new Python engine wired to ``SqliteStore``.
    """
    settings = settings or resolve_settings()
    engine = AgentEngine(settings, include_builtins=False)
    db = store or SqliteStore(db_path)
    int_reg = build_integration_registry(db)
    for tool in int_reg._tools.values():
        engine.registry.register(ToolDef(
            name=tool.name,
            description=tool.description,
            args=tool.args,
            handler=tool.handler,
            read_only=tool.read_only,
            category=tool.category,
            verification=tool.verification,
        ))
    return engine, db


def make_mock_client() -> ChatClient:
    """A deterministic fake LLM for self-tests (no network/keys).

    It emits one tool call to ``dashboard_kpis`` then a final answer, proving
    the engine + backend are wired end-to-end without a real provider.
    """
    from .types import ChatResult, ToolCall

    class _Mock(ChatClient):
        def __init__(self) -> None:
            self._turn = 0

        async def chat(  # type: ignore[override]
            self,
            provider,
            *,
            base_url: str,
            api_key: str,
            model: str,
            messages: list,
            functions: list,
            max_tokens: int,
            temperature: float,
            on_delta=None,
            signal=None,
        ):
            self._turn += 1
            if self._turn == 1:
                return ChatResult(
                    content=None,
                    tool_calls=[ToolCall(id="c1", name="dashboard_kpis", arguments="{}")],
                )
            return ChatResult(content="تم استعراض مؤشرات لوحة التحكم بنجاح.", tool_calls=[])

    return _Mock()
