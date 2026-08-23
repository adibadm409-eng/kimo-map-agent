"""Offline smoke test for the Kimo Python engine.

Uses a scripted chat client (no network) to exercise the core ReAct loop:
the ``execute`` envelope, inner-tool validation, the read-evidence gate, and
final-answer emission. Run with::

    python3 examples/smoke_test.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from kimo.engine import AgentEngine
from kimo.config import AgentSettings
from kimo.llm import ChatClient, ChatResult, ToolCall
from kimo.tools import ToolArg, ToolResult
from kimo.types import EngineEvent


class ScriptedClient(ChatClient):
    """Returns pre-programmed responses in order, then a safe fallback."""

    def __init__(self, script: list[ChatResult]) -> None:
        super().__init__()
        self._script = list(script)
        self._i = 0

    async def chat(self, *args, **kwargs):  # noqa: D401
        if self._i < len(self._script):
            r = self._script[self._i]
            self._i += 1
            return r
        # Default: answer from whatever evidence is present.
        return ChatResult(content="تمت المعالجة بناءً على نتائج الأدوات.", tool_calls=[])


def tc(name: str, args: str, id: str = "call_1") -> ToolCall:
    return ToolCall(id=id, name=name, arguments=args)


async def main() -> int:
    events: list[EngineEvent] = []
    settings = AgentSettings(
        provider_id="openai",
        model="gpt-4o-mini",
        api_key="test-key",
        max_tool_rounds=8,
        max_tool_calls=20,
    )
    engine = AgentEngine(settings, client=ScriptedClient([]))
    engine.on_event(events.append)

    # Scenario A: read intent + execute envelope -> should run tool, emit final answer.
    script_a = [
        ChatResult(
            content=None,
            tool_calls=[
                tc("execute", '{"tool": "current_local_time", "args": {}}'),
            ],
        ),
        ChatResult(content="الوقت المحلي الحالي هو ما أرجعته الأداة.", tool_calls=[]),
    ]
    engine.client = ScriptedClient(script_a)
    session = await engine.create_session("اختبار أ")
    await engine.send_user_message(session.id, "اعرض الوقت المحلي الحالي")

    types = [e.type for e in events]
    assert "observation" in types, "expected a tool observation event"
    assert "text" in types, "expected a final text event"
    print("Scenario A OK — events:", types)

    # Scenario B: read intent that never calls a tool -> evidence gate should fail.
    events_b: list[EngineEvent] = []
    script_b = [ChatResult(content="أوه، لا أملك بيانات.", tool_calls=[])]
    engine2 = AgentEngine(settings, client=ScriptedClient(script_b))
    engine2.on_event(events_b.append)
    s2 = await engine2.create_session("اختبار ب")
    await engine2.send_user_message(s2.id, "كم عدد العقارات المحلية؟")
    assert any(e.type == "error" and "دون دليل" in (e.message or "") for e in events_b), "evidence gate should fail read-without-tool"
    print("Scenario B OK — evidence gate triggered")

    # Scenario C: unknown tool is blocked before execution.
    events_c: list[EngineEvent] = []
    script_c = [ChatResult(content=None, tool_calls=[tc("nonexistent_tool", "{}")])]
    engine3 = AgentEngine(settings, client=ScriptedClient(script_c))
    engine3.on_event(events_c.append)
    s3 = await engine3.create_session("اختبار ج")
    await engine3.send_user_message(s3.id, "نفّذ شيئاً غريباً")
    obs = [e for e in events_c if e.type == "observation"]
    assert obs and "غير معروفة" in (obs[0].detail or ""), "unknown tool must be blocked"
    print("Scenario C OK — unknown tool blocked")

    # Scenario D: malformed tool args -> the loop repairs and retries (resilience).
    events_d: list[EngineEvent] = []
    script_d = [
        ChatResult(content=None, tool_calls=[tc("execute", '{"tool": "greet", "args": {}}')]),  # missing required "name"
        ChatResult(content=None, tool_calls=[tc("execute", '{"tool": "greet", "args": {"name": "علي"}}')]),  # valid
        ChatResult(content="تم الترحيب بعلي.", tool_calls=[]),
    ]
    engine4 = AgentEngine(settings, client=ScriptedClient(script_d))
    engine4.on_event(events_d.append)

    def greet(args, ctx):
        return ToolResult(ok=True, data={"name": args.get("name")}, observation=f"مرحباً {args.get('name')}")

    engine4.registry.register_handler(
        "greet", "أداة ترحيب للاختبار.", [ToolArg("name", "string", required=True)], greet
    )
    s4 = await engine4.create_session("اختبار د")
    await engine4.send_user_message(s4.id, "رحّب بعلي")
    assert any(e.type == "recovery" for e in events_d), "expected a repair/recovery event"
    assert any(e.type == "text" for e in events_d), "expected final answer after repair"
    print("Scenario D OK — malformed args repaired")

    # Scenario E: parallel tool calls execute concurrently.
    events_e: list[EngineEvent] = []
    script_e = [
        ChatResult(
            content=None,
            tool_calls=[
                tc("current_local_time", "{}", id="c1"),
                tc("echo", '{"value": "hi"}', id="c2"),
            ],
        ),
        ChatResult(content="أنجزت.", tool_calls=[]),
    ]
    engine5 = AgentEngine(settings, client=ScriptedClient(script_e))
    engine5.on_event(events_e.append)
    s5 = await engine5.create_session("اختبار ه")
    await engine5.send_user_message(s5.id, "نفّذ أداتين معاً")
    obs_e = [e for e in events_e if e.type == "observation"]
    assert len(obs_e) >= 2, "expected two tool observations from parallel execution"
    assert any(e.type == "text" for e in events_e)
    print("Scenario E OK — parallel tool execution")

    print("\nALL SMOKE TESTS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
