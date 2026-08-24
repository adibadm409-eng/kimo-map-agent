"""التحقق من توافق المحرك مع التطبيق المبني:

1. المحرك يكتب المحادثة في جداول agent_messages/agent_sessions (فجوة العرض).
2. نمط الإيقاف عند الأدوات يعمل (المحرك يطلب، التطبيق ينفّذ، يرد النتيجة).
3. بعد انتهاء الرد، رسالة المساعد موجودة في قاعدة التطبيق فعلياً.
"""

import asyncio
import os
import sqlite3
import tempfile

from kimo.config import AgentSettings
from kimo.engine import AgentEngine
from kimo.host import make_mock_client, build_agent
from kimo.integration.store import SqliteStore
from kimo.integration.app_session_store import AppSessionStore
from kimo.loop import PauseForClient


def build(db_path):
    settings = AgentSettings(model="mock", api_key="x")
    engine = AgentEngine(settings, include_builtins=False, store=AppSessionStore(db_path))
    db = SqliteStore(db_path)
    int_reg = build_agent.__wrapped__ if hasattr(build_agent, "__wrapped__") else None
    # بناء يدوي للمسجّل فقط
    from kimo.integration.backend import build_integration_registry
    int_reg = build_integration_registry(db)
    for tool in int_reg._tools.values():
        from kimo.tools import ToolDef
        engine.registry.register(ToolDef(
            name=tool.name, description=tool.description, args=tool.args,
            handler=tool.handler, read_only=tool.read_only,
            category=tool.category, verification=tool.verification,
        ))
    engine.client = make_mock_client()
    return engine


async def test_persists_to_app_tables():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    try:
        engine = build(path)
        sid = (await engine.create_session("اختبار")).id
        await engine.send_user_message(sid, "أعطني مؤشرات لوحة التحكم")

        # قراءة مباشرة من قاعدة التطبيق كما يفعل src/assistant/store.ts
        conn = sqlite3.connect(path)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT role, kind, content FROM agent_messages ORDER BY created_at"
        ).fetchall()
        conn.close()

        roles = [(r["role"], r["kind"], (r["content"] or "")[:40]) for r in rows]
        print("رسائل agent_messages:", roles)

        # يجب أن توجد رسالة مستخدم ورسالة مساعد فيها الجواب
        assert any(r["role"] == "user" for r in rows), "لا رسالة مستخدم"
        asst = [r for r in rows if r["role"] == "assistant" and r["content"]]
        assert asst, "لا رسالة مساعد في قاعدة التطبيق"
        assert "لوحة التحكم" in asst[0]["content"], "الجواب غير محفوظ"
        print("OK: المحرك يكتب المحادثة في جداول التطبيق (فجوة العرض مُغلقة).")
    finally:
        os.remove(path)


async def test_client_pause_resume():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    try:
        engine = build(path)
        sid = (await engine.create_session("إيقاف")).id

        # الجولة الأولى: المحرك يطلب أداة ويتوقف
        try:
            await engine.run_round(sid, client_mode=True, initial_content="أعطني المؤشرات")
            raise AssertionError("كان يجب أن يرفع PauseForClient")
        except PauseForClient as p:
            calls = p.calls
            print("المحرك طلب الأدوات:", [c["name"] for c in calls])
            assert calls and calls[0]["name"] == "dashboard_kpis"

        # التطبيق ينفّذ ويعيد النتيجة
        results = {c["id"]: {"ok": True, "name": c["name"], "observation": "إجمالي العقارات: 12"} for c in calls}
        await engine.run_round(sid, client_mode=True, client_results=results)

        answer = await engine.last_assistant_text(sid)
        print("الجواب النهائي:", answer)
        assert answer and "لوحة التحكم" in answer
        print("OK: نمط الإيقاف/الاستئناف يعمل (المحرك يفكّر، التطبيق ينفّذ).")
    finally:
        os.remove(path)


if __name__ == "__main__":
    asyncio.run(test_persists_to_app_tables())
    asyncio.run(test_client_pause_resume())
    print("\n=== التوافق مع التطبيق المبني متحقَّق ===")
