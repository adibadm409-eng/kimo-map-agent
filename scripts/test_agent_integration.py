#!/usr/bin/env python3
"""اختبار تكامل لمحرك كيمو المضمَّن (Embedded Agent).

يتحقق من أربع قدرات أساسية للوكيل:
  1) الاستجابة: ينتج المحرك جواباً نهائياً (نصاً).
  2) تنفيذ المهام: ينفّذ أداة (dashboard_kpis) ويستخدم نتيجتها.
  3) المتابعة: يتابع الحوار عبر جولات متعددة مع احتفاظ السياق (الجلسة).
  4) التكامل مع التطبيق: يكتب في جداول agent_sessions / agent_messages.

يستخدم عميلاً وهمياً (make_mock_client) لا يحتاج شبكة أو مفاتيح حقيقية،
لكنه يحاكي سلوك نموذج حقيقي: يطلب أداة في الجولة الأولى ثم يعيد جواباً نهائياً.
"""

import asyncio
import os
import sqlite3
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from kimo.host import build_agent, make_mock_client  # noqa: E402
from kimo.config import AgentSettings  # noqa: E402
from kimo.integration.app_session_store import AppSessionStore  # noqa: E402
from kimo.llm import ChatClient  # noqa: E402

DB = os.path.join(tempfile.mkdtemp(), "agent_integration.db")


def _live_settings():
    """إعدادات حقيقية من متغيرات البيئة (للاختبار الحي مع مزود فعلي)."""
    return AgentSettings(
        provider_id=os.environ.get("KIMO_TEST_PROVIDER", "openai"),
        model=os.environ.get("KIMO_TEST_MODEL", "gpt-4o-mini"),
        api_key=os.environ["KIMO_TEST_API_KEY"],
    )


def build_engine():
    store = AppSessionStore(DB)
    engine, _ = build_agent(db_path=DB, session_store=store)
    if os.environ.get("KIMO_LIVE") == "1" and os.environ.get("KIMO_TEST_API_KEY"):
        # وضع حي: عميل حقيقي يتصل بمزود فعلي (يتطلب مفتاح API).
        engine.settings = _live_settings()
        engine.client = ChatClient()  # النقل الافتراضي urllib (stdlib فقط)
        print("   [وضع حي] استخدام مزود حقيقي:", engine.settings.provider_id, engine.settings.model)
    else:
        # وضع mock: لا يحتاج شبكة/مفاتيح، يحاكي سلوك النموذج.
        engine.settings = AgentSettings(
            model="mock-model", api_key="mock-key", provider_id="openai"
        )
        engine.client = make_mock_client()
    return engine, store


def dump_messages(msgs):
    for m in msgs:
        content = (m.content or "")[:60].replace("\n", " ")
        print(f"   [{m.role}/{m.kind}] {content!r}")
    return msgs


def get_rows(table):
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(f"SELECT * FROM {table} ORDER BY created_at ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


async def main():
    engine, store = build_engine()
    sid = "integration-session-1"

    print("== الجولة 1: طلب مؤشرات لوحة التحكم (يستدعي أداة dashboard_kpis) ==")
    await engine.send_user_message(sid, "أعطني مؤشرات لوحة التحكم")
    msgs1 = await store.get_messages(sid)
    print(f"   عدد الرسائل بعد الجولة 1: {len(msgs1)}")
    dump_messages(msgs1)

    print("\n== الجولة 2: متابعة (تعتمد على سياق الجلسة) ==")
    await engine.send_user_message(sid, "وماذا عن المشاريع؟")
    msgs2 = await store.get_messages(sid)
    print(f"   عدد الرسائل بعد الجولة 2: {len(msgs2)}")
    dump_messages(msgs2)

    # --- التحققات ---
    roles = [m.role for m in msgs2]
    assert "user" in roles, "❌ لم تُحفظ رسالة المستخدم"
    assert "assistant" in roles, "❌ لم تُحفظ رسالة المحرك"

    tool_msgs = [m for m in msgs2 if m.kind == "tool"]
    assert tool_msgs, "❌ لم تُنفَّذ/تُحفظ أداة dashboard_kpis"

    final_text = [m for m in msgs2 if m.role == "assistant" and m.kind == "text"]
    assert final_text, "❌ لا يوجد جواب نهائي نصّي"

    sessions = get_rows("agent_sessions")
    assert sessions, "❌ لم تُحفظ جلسة في agent_sessions"

    # المتابعة: الجولة 2 أضافت رسائل جديدة (سياق محفوظ)
    assert len(msgs2) > len(msgs1), "❌ الجولة 2 لم تُكمل المحادثة"

    print("\n✅ نجح اختبار التكامل:")
    print(f"   الجلسات: {len(sessions)} | الرسائل الكلية: {len(msgs2)} | رسائل الأداة: {len(tool_msgs)}")
    print(f"   الجواب النهائي: {final_text[-1].content!r}")


if __name__ == "__main__":
    asyncio.run(main())
