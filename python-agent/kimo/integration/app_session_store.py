"""مخزن جلسات ورسائل مربوط تماماً بجداول التطبيق.

في التطبيق المبني (بايثون مضمّن داخل التطبيق) يشارك المحرك قاعدة بيانات
التطبيق نفسها. لذلك يكتب هذا المخزن في جداول ``agent_messages`` /
``agent_sessions`` بنفس المخطط الذي يقرأه ``src/assistant/store.ts``، فتظهر
رسائل المحرك مباشرةً في واجهة التطبيق دون أي طبقة وسطية.

مخطط التطبيق (من store.ts):
  agent_sessions(id, title, created_at, updated_at, provider_label, model, mode)
  agent_messages(id, session_id, role, kind, content, meta, created_at)
"""

from __future__ import annotations

import json
import sqlite3
import time
import uuid
from typing import Any, Optional

from ..session import Message, SessionMeta, SessionStore
from ..types import ToolCall


def _gen_id(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4().hex[:14]}"


class AppSessionStore(SessionStore):
    """مخزن SQLite يستخدم جداول التطبيق مباشرة."""

    def __init__(self, db_path: str = "kimo.db") -> None:
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self._ensure_schema()

    def _ensure_schema(self) -> None:
        cur = self.conn.cursor()
        cur.execute(
            """CREATE TABLE IF NOT EXISTS agent_sessions (
                id TEXT PRIMARY KEY, title TEXT, created_at INTEGER,
                updated_at INTEGER, provider_label TEXT, model TEXT, mode TEXT
            )"""
        )
        cur.execute(
            """CREATE TABLE IF NOT EXISTS agent_messages (
                id TEXT PRIMARY KEY, session_id TEXT, role TEXT, kind TEXT,
                content TEXT, meta TEXT, created_at INTEGER
            )"""
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_agent_msgs_app ON agent_messages (session_id, created_at)"
        )
        self.conn.commit()

    def close(self) -> None:
        self.conn.close()

    async def list_sessions(self) -> list[SessionMeta]:
        cur = self.conn.execute("SELECT * FROM agent_sessions ORDER BY created_at DESC")
        return [self._row_to_meta(r) for r in cur.fetchall()]

    async def get_session(self, session_id: str) -> Optional[SessionMeta]:
        cur = self.conn.execute("SELECT * FROM agent_sessions WHERE id = ?", (session_id,))
        r = cur.fetchone()
        return self._row_to_meta(r) if r else None

    async def create_session(self, title: Optional[str] = None) -> SessionMeta:
        sid = _gen_id("s")
        now = int(time.time() * 1000)
        self.conn.execute(
            "INSERT INTO agent_sessions (id, title, created_at, updated_at, mode) VALUES (?, ?, ?, ?, ?)",
            (sid, title or "محادثة جديدة", now, now, "supervisor"),
        )
        self.conn.commit()
        return SessionMeta(id=sid, title=title or "محادثة جديدة", created_at=now)

    async def update_session_meta(self, session_id: str, **fields: Any) -> None:
        allowed = {"title", "provider_label", "model", "mode"}
        sets = {k: v for k, v in fields.items() if k in allowed}
        if not sets:
            return
        now = int(time.time() * 1000)
        clauses = ", ".join(f"{k} = ?" for k in sets)
        self.conn.execute(
            f"UPDATE agent_sessions SET {clauses}, updated_at = ? WHERE id = ?",
            (*sets.values(), now, session_id),
        )
        self.conn.commit()

    async def get_messages(self, session_id: str) -> list[Message]:
        cur = self.conn.execute(
            "SELECT * FROM agent_messages WHERE session_id = ? ORDER BY created_at ASC",
            (session_id,),
        )
        rows = cur.fetchall()
        out: list[Message] = []
        for r in rows:
            meta = json.loads(r["meta"]) if r["meta"] else {}
            raw_tc = meta.pop("tool_calls", []) if isinstance(meta, dict) else []
            tool_calls = [
                ToolCall(id=t.get("id", ""), name=t.get("name", ""), arguments=t.get("arguments", ""))
                for t in raw_tc
            ]
            out.append(
                Message(
                    id=r["id"],
                    session_id=r["session_id"],
                    role=r["role"],
                    content=r["content"],
                    kind=r["kind"] or "text",
                    meta=meta,
                    tool_calls=tool_calls,
                    created_at=int(r["created_at"] or 0),
                )
            )
        return out

    async def add_message(self, message: Message) -> Message:
        meta = dict(message.meta or {})
        if message.tool_calls:
            meta["tool_calls"] = [
                {"id": tc.id, "name": tc.name, "arguments": tc.arguments}
                for tc in message.tool_calls
            ]
        content = message.content
        if not isinstance(content, str):
            content = json.dumps(content, ensure_ascii=False) if content is not None else None
        self.conn.execute(
            "INSERT INTO agent_messages (id, session_id, role, kind, content, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                message.id,
                message.session_id,
                message.role,
                message.kind,
                content,
                json.dumps(meta, ensure_ascii=False),
                message.created_at,
            ),
        )
        self.conn.commit()
        return message

    def _row_to_meta(self, r: sqlite3.Row) -> SessionMeta:
        return SessionMeta(
            id=r["id"],
            title=r["title"] or "محادثة جديدة",
            provider_label=r["provider_label"],
            model=r["model"],
            created_at=int(r["created_at"] or 0),
        )
