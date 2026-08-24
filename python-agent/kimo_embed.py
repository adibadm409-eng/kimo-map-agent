"""نقطة دخول المحرك للتشغيل المضمَّن داخل التطبيق المبني (بلا خادم HTTP).

في التطبيق المبني (Android عبر Chaquopy / iOS عبر PythonKit) يُستدعى هذا
الملف مباشرةً من الطبقة الأصلية؛ فيكتب المحرك المحادثة في قاعدة التطبيق
ذاتها (agent_messages / agent_sessions) ويعيد الأحداث والجواب.
"""
from __future__ import annotations

import asyncio
import json
import os

from kimo.host import build_agent
from kimo.integration.app_session_store import AppSessionStore


async def _run_chat(session_id: str, text: str, db_path: str, mock: bool) -> dict:
    if mock:
        os.environ["KIMO_MOCK"] = "1"
    store = AppSessionStore(db_path)
    engine = build_agent(session_store=store)

    result = await engine.run_chat(session_id, text, emit_events=True)
    return {"answer": result.get("answer"), "events": result.get("events", [])}


def run_chat_sync(session_id: str, text: str, db_path: str, mock: bool = False) -> str:
    """نسخة متزامنة للطبقة الأصلية (Chaquopy/Kotlin). ترجع JSON-string."""
    data = asyncio.run(_run_chat(session_id, text, db_path, mock=bool(mock)))
    return json.dumps(data, ensure_ascii=False)


if __name__ == "__main__":
    sid = os.environ.get("KIMO_TEST_SESSION", "embed-session")
    db = os.environ.get("KIMO_DB_PATH", "kimo_embed_test.db")
    out = run_chat_sync(sid, "أعطني مؤشرات لوحة التحكم", db, mock=True)
    print(out)
