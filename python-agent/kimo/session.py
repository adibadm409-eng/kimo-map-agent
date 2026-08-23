"""Conversation + session persistence (mirrors ``assistant/store.ts``)."""

from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional


def gen_id(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4().hex[:14]}"


@dataclass
class Message:
    id: str = field(default_factory=lambda: gen_id("m"))
    session_id: str = ""
    role: str = "user"  # user | assistant | tool | system
    content: Any = None
    kind: str = "text"  # text | progress | error | system | tool
    meta: dict[str, Any] = field(default_factory=dict)
    tool_calls: list[Any] = field(default_factory=list)
    created_at: int = field(default_factory=lambda: int(time.time() * 1000))


@dataclass
class SessionMeta:
    id: str
    title: str = "محادثة جديدة"
    provider_label: Optional[str] = None
    model: Optional[str] = None
    created_at: int = field(default_factory=lambda: int(time.time() * 1000))


class SessionStore:
    """Pluggable message/session storage. Async by design for speed."""

    async def list_sessions(self) -> list[SessionMeta]:
        raise NotImplementedError

    async def get_session(self, session_id: str) -> Optional[SessionMeta]:
        raise NotImplementedError

    async def create_session(self, title: Optional[str] = None) -> SessionMeta:
        raise NotImplementedError

    async def update_session_meta(self, session_id: str, **fields: Any) -> None:
        raise NotImplementedError

    async def get_messages(self, session_id: str) -> list[Message]:
        raise NotImplementedError

    async def add_message(self, message: Message) -> Message:
        raise NotImplementedError


class MemorySessionStore(SessionStore):
    """In-process store; swap for a DB-backed one in production."""

    def __init__(self) -> None:
        self._sessions: dict[str, SessionMeta] = {}
        self._messages: dict[str, list[Message]] = {}
        self._lock = asyncio.Lock()

    async def list_sessions(self) -> list[SessionMeta]:
        return list(self._sessions.values())

    async def get_session(self, session_id: str) -> Optional[SessionMeta]:
        return self._sessions.get(session_id)

    async def create_session(self, title: Optional[str] = None) -> SessionMeta:
        sid = gen_id("s")
        meta = SessionMeta(id=sid, title=title or "محادثة جديدة")
        async with self._lock:
            self._sessions[sid] = meta
            self._messages[sid] = []
        return meta

    async def update_session_meta(self, session_id: str, **fields: Any) -> None:
        meta = self._sessions.get(session_id)
        if not meta:
            return
        for k, v in fields.items():
            setattr(meta, k, v)

    async def get_messages(self, session_id: str) -> list[Message]:
        return list(self._messages.get(session_id, []))

    async def add_message(self, message: Message) -> Message:
        async with self._lock:
            self._messages.setdefault(message.session_id, []).append(message)
        return message
