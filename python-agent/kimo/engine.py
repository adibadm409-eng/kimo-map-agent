"""Top-level engine API (mirrors ``assistant/executor.ts`` public surface)."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Callable, Optional

from .builtin_tools import register_builtins
from .config import AgentSettings, provider_label
from .loop import ConnConfig, RunContext, run_loop, PauseForClient
from .llm import ChatClient
from .session import MemorySessionStore, SessionStore, Message
from .tools import Registry, ToolBackend
from .types import EngineEvent


@dataclass
class SendOptions:
    attachments: Optional[list[dict[str, Any]]] = None
    audio: Optional[dict[str, Any]] = None


class _SessionState:
    def __init__(self) -> None:
        self.busy = False
        self.cancelled = False
        self.pending: Optional[dict[str, Any]] = None


class AgentEngine:
    """The Kimo agent engine.

    Usage::

        engine = AgentEngine(settings)
        engine.registry.register_handler("query", ..., handler)
        session = await engine.create_session()
        await engine.send_user_message(session.id, "اعرض العقارات")
        engine.on_event(lambda e: print(e.type, e.content))
    """

    def __init__(
        self,
        settings: Optional[AgentSettings] = None,
        *,
        store: Optional[SessionStore] = None,
        client: Optional[ChatClient] = None,
        include_builtins: bool = True,
    ) -> None:
        self.settings = settings or AgentSettings()
        self.store = store or MemorySessionStore()
        self.client = client or ChatClient()
        self.registry = Registry()
        if include_builtins:
            register_builtins(self.registry)
        self._states: dict[str, _SessionState] = {}
        self._listeners: list[Callable[[EngineEvent], None]] = []

    # --- event subscription --------------------------------------------------

    def on_event(self, cb: Callable[[EngineEvent], None]) -> Callable[[], None]:
        self._listeners.append(cb)

        def off() -> None:
            if cb in self._listeners:
                self._listeners.remove(cb)

        return off

    def _emit(self, event: EngineEvent) -> None:
        for cb in self._listeners:
            try:
                cb(event)
            except Exception:  # noqa: BLE001 - a bad listener must not break the loop
                pass

    # --- session helpers -----------------------------------------------------

    def _state(self, session_id: str) -> _SessionState:
        return self._states.setdefault(session_id, _SessionState())

    async def create_session(self, title: Optional[str] = None) -> Any:
        return await self.store.create_session(title)

    async def list_sessions(self) -> list[Any]:
        return await self.store.list_sessions()

    def is_busy(self, session_id: str) -> bool:
        return self._state(session_id).busy

    # --- configuration -------------------------------------------------------

    def set_backend(self, backend: ToolBackend) -> None:
        self.registry.set_backend(backend)

    def _resolve_conn(self) -> ConnConfig:
        s = self.settings
        cfg = s.active_config()
        if not s.model or not s.api_key:
            raise RuntimeError("لم يُعدَّ المزود بعد: أضف مفتاح API واختر موديلاً.")
        return ConnConfig(
            settings=s,
            provider_id=s.provider_id,
            provider_name=s.provider_name or provider_label(s.provider_id),
            model=s.model,
            base_url=cfg["baseUrl"],
            api_key=s.api_key,
        )

    # --- run helper ----------------------------------------------------------

    async def _run(self, session_id: str, initial_content: Optional[str] = None) -> None:
        conn = self._resolve_conn()
        state = self._state(session_id)
        state.busy = True
        state.cancelled = False
        try:
            await run_loop(
                session_id,
                conn,
                registry=self.registry,
                store=self.store,
                client=self.client,
                emit=self._emit,
                ctx=RunContext(session_id=session_id, settings=self.settings),
                initial_content=initial_content,
                emit_events=True,
            )
        finally:
            state.busy = False
            self._emit(EngineEvent(type="done", outcome="completed"))

    # --- public API ----------------------------------------------------------

    async def send_user_message(self, session_id: str, text: str, opts: Optional[SendOptions] = None) -> None:
        state = self._state(session_id)
        if state.busy:
            return
        try:
            conn = self._resolve_conn()
        except RuntimeError as e:
            await self.store.add_message(Message(session_id=session_id, role="assistant", content=str(e), kind="error"))
            self._emit(EngineEvent(type="error", message=str(e)))
            return

        await self.store.add_message(Message(session_id=session_id, role="user", content=text, kind="text"))
        msgs = await self.store.get_messages(session_id)
        if len(msgs) <= 1:
            await self.store.update_session_meta(session_id, title=text.replace("\n", " ").strip()[:40] or "محادثة جديدة")
        await self._run(session_id, initial_content=text)

    async def answer_ask(self, session_id: str, answer: str) -> None:
        if self._state(session_id).busy:
            return
        await self.store.add_message(Message(session_id=session_id, role="user", content=f"[إجابة المستخدم على سؤالك] {answer}", kind="text"))
        await self._run(session_id)

    async def answer_confirmation(self, session_id: str, approve: bool) -> None:
        if self._state(session_id).busy:
            return
        verb = "موافقة المستخدم على" if approve else "رفض المستخدم للإجراء"
        await self.store.add_message(Message(session_id=session_id, role="user", content=f"[{verb} الإجراء]", kind="text"))
        await self._run(session_id)

    # --- client-driven round (built app: app executes the tools) -----------

    async def run_round(
        self,
        session_id: str,
        *,
        client_mode: bool = False,
        client_results: Optional[dict] = None,
        initial_content: Optional[str] = None,
    ) -> None:
        """شغّل جولة واحدة من النموذج.

        في ``client_mode`` (وبلا ``client_results``) تتوقف الحلقة وترفع
        :class:`PauseForClient` بالأدوات المطلوبة؛ التطبيق ينفّذها على قاعدته
        ويعيد النتيجة عبر ``client_results``.
        """
        conn = self._resolve_conn()
        ctx = RunContext(session_id=session_id, settings=self.settings)
        await run_loop(
            session_id,
            conn,
            registry=self.registry,
            store=self.store,
            client=self.client,
            emit=self._emit,
            ctx=ctx,
            initial_content=initial_content,
            emit_events=True,
            client_mode=client_mode,
            client_results=client_results,
        )

    async def last_assistant_text(self, session_id: str) -> str:
        msgs = await self.store.get_messages(session_id)
        for m in reversed(msgs):
            if m.role == "assistant" and (m.k.a if False else (m.kind == "text" or m.kind is None)) and m.content:
                return m.content
        return ""

    def cancel(self, session_id: str) -> None:
        self._state(session_id).cancelled = True
