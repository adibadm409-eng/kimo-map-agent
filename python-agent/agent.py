#!/usr/bin/env python3
"""CLI host for the Kimo Python engine — the active agent of the pulled copy.

Usage
-----
  # real provider (reads KIMO_PROVIDER / KIMO_API_KEY / KIMO_MODEL)
  KIMO_PROVIDER=gemini KIMO_API_KEY=... python3 agent.py

  # self-test with a mock LLM (no keys, proves engine+backend wiring)
  python3 agent.py --mock

  # custom db file
  python3 agent.py --db ./my_data.db
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from kimo.engine import EngineEvent
from kimo.host import build_agent, make_mock_client


async def _run(db_path: str, mock: bool) -> int:
    if mock:
        from kimo.config import AgentSettings
        from kimo.integration.store import SqliteStore
        store = SqliteStore(":memory:", seed=True)
        settings = AgentSettings(provider_id="openai", model="mock", api_key="mock")
        engine, _ = build_agent(db_path=":memory:", settings=settings, store=store)
        engine.client = make_mock_client()
    else:
        engine, _ = build_agent(db_path=db_path)

    session = await engine.create_session(title="محادثة كيمو")

    def _on_event(e: EngineEvent) -> None:
        if e.type in ("stream", "text", "token"):
            sys.stdout.write(e.content or "")
            sys.stdout.flush()
        elif e.type == "observation":
            status = "✓" if getattr(e, "status", None) == "success" else "•"
            detail = getattr(e, "detail", "") or ""
            print(f"\n  {status} {getattr(e, 'title', '')}: {detail[:160]}")
        elif e.type == "error":
            print(f"\n[خطأ] {e.message}", file=sys.stderr)
        elif e.type == "done":
            print()

    engine.on_event(_on_event)

    if mock:
        await engine.send_user_message(session.id, "اعرض مؤشرات لوحة التحكم")
        return 0

    print("كيمو جاهز. اكتب رسالتك (.exit للخروج):")
    while True:
        try:
            text = input("أنت › ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if text in (".exit", ".quit", ""):
            break
        await engine.send_user_message(session.id, text)
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Kimo Python agent host")
    ap.add_argument("--db", default="kimo.db", help="مسار قاعدة SQLite")
    ap.add_argument("--mock", action="store_true", help="استخدم LLM وهمياً للاختبار")
    args = ap.parse_args()
    return asyncio.run(_run(args.db, args.mock))


if __name__ == "__main__":
    sys.exit(main())
