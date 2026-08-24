"""نقطة دخول المحرك للتشغيل المضمَّن داخل التطبيق المبني (بلا خادم HTTP).

في التطبيق المبني (Android عبر Chaquopy / iOS عبر PythonKit) تستدعي الطبقة
الأصلية ``run_chat_sync`` مباشرةً؛ فيكتب المحرك المحادثة في قاعدة التطبيق ذاتها
(agent_messages / agent_sessions) ويعيد الأحداث والجواب كـ JSON-string.
"""
from __future__ import annotations

import asyncio
import json
import os

from kimo.host import build_agent, make_mock_client
from kimo.integration.app_session_store import AppSessionStore


class EmbeddedEngine:
    def __init__(self, db_path: str) -> None:
        self.session_store = AppSessionStore(db_path)
        self.engine, _ = build_agent(db_path=db_path, session_store=self.session_store)
        if os.environ.get("KIMO_MOCK"):
            self.engine.client = make_mock_client()

    def chat(self, session_id: str, text: str) -> dict:
        collected: list[dict] = []
        final_text = ""

        def on_event(e):
            item = {"type": e.type}
            for attr in ("name", "content", "ok", "status", "title", "detail", "observation"):
                v = getattr(e, attr, None)
                if v is not None:
                    item[attr] = v
            collected.append(item)
            if e.type == "text":
                nonlocal final_text
                final_text = e.content or final_text

        off = self.engine.on_event(on_event)
        try:
            asyncio.run(self.engine.send_user_message(session_id, text))
        finally:
            off()
        return {"answer": final_text, "events": collected}


def run_chat_sync(session_id: str, text: str, db_path: str, mock: bool = False) -> str:
    """نسخة متزامنة للطبقة الأصلية (Chaquopy/Kotlin). ترجع JSON-string."""
    if mock:
        os.environ["KIMO_MOCK"] = "1"
    data = EmbeddedEngine(db_path).chat(session_id, text)
    return json.dumps(data, ensure_ascii=False)


if __name__ == "__main__":
    sid = os.environ.get("KIMO_TEST_SESSION", "embed-session")
    db = os.environ.get("KIMO_DB_PATH", "kimo_embed_test.db")
    print(run_chat_sync(sid, "أعطني مؤشرات لوحة التحكم", db, mock=True))
