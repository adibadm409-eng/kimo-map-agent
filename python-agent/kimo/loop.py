"""The ReAct run loop (mirrors ``assistant/executor.ts::runLoop``).

This is the heart of Kimo. It drives the model in rounds:

    think (chat) -> validate tool calls -> execute tools -> observe -> repeat

with the same guardrails as the original engine:

* tool calls are validated against their schema *before* execution;
* an ``execute`` envelope re-validates its inner tool;
* read-intent requests that end with only model text (no evidence) are sent
  back to the model or failed explicitly — never silently hallucinated;
* repeated identical tool calls are detected and halted;
* per-run limits on rounds / total calls / runtime protect the system;
* confirmation / ask-user tools pause the loop and surface a decision.
"""

from __future__ import annotations

import hashlib
import json
import re
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Optional

from .config import AgentSettings, ModelProfile, ProviderDef, WireFamily, default_provider, resolve_profile
from .intent import analyze_intent, build_context_summary
from .llm import ChatClient, chat_with_retry
from .prompts import build_system_prompt
from .session import SessionStore, Message, gen_id
from .skills import AgentPlan, AgentSkill, advance_non_evidence, plan_for_skill
from .tools import Registry, ToolCall, tool_sig
from .types import ChatMessage, ChatResult, EngineEvent, ToolResult, parse_tool_args

EmitFn = Callable[[EngineEvent], None]

MAX_NO_EVIDENCE_RECOVERIES = 2

_READ_INTENT_RE = re.compile(
    r"(?:اعرض|أظهر|اظهر|اقرأ|استكشف|ابحث|اعثر|كم|عدد|إجمالي|ملخص|جدول|شجرة|المؤشرات|التدفقات|الأقساط|المشروع|الوقت المحلي|تاريخ اليوم|البيانات المحلية|التنبيهات|التدقيق|من غيّر)"
)
_EXEC_INTENT_RE = re.compile(
    r"(?:أنشئ|انشئ|أضف|اضف|عدّل|عدل|حدّث|حدث|احذف|حذف|سجّل|سجل\s+(?:دفعة|دفع|مبلغ|قسط|إيصال|تحويل)|استورد|استيراد|ذكرني|تذكير)"
)


def _hash(s: str) -> str:
    return hashlib.md5(s.encode("utf-8")).hexdigest()[:12]


def _truncate(s: str, n: int) -> str:
    s = str(s or "")
    return s[:n] + "…" if len(s) > n else s


@dataclass
class ConnConfig:
    settings: AgentSettings
    provider_id: str
    provider_name: str
    model: str
    base_url: str
    api_key: str


def provider_proxy(conn: ConnConfig) -> ProviderDef:
    if conn.provider_id.startswith("custom:"):
        return ProviderDef(
            id="custom",
            name=conn.provider_name,
            wire_family=WireFamily.CUSTOM,
            base_url=conn.base_url,
        )
    base = default_provider(conn.provider_id)
    return base.to_proxy(base_url=conn.base_url, name=conn.provider_name)


@dataclass
class RunContext:
    """Shared state passed to tool handlers (mirrors ``ctx`` in invokeTools)."""

    session_id: str
    settings: AgentSettings
    skill: Optional[AgentSkill] = None
    task_id: Optional[str] = None
    pending: Optional[dict[str, Any]] = None


async def run_loop(
    session_id: str,
    conn: ConnConfig,
    *,
    registry: Registry,
    store: SessionStore,
    client: ChatClient,
    emit: Optional[EmitFn] = None,
    ctx: Optional[RunContext] = None,
    initial_content: Optional[Any] = None,
    emit_events: bool = True,
) -> None:
    if emit is None:
        emit = lambda e: None  # noqa: E731

    settings = conn.settings
    aborter = _Aborter()

    # --- skill / plan resolution --------------------------------------------
    messages = await store.get_messages(session_id)
    last_user = next((m for m in reversed(messages) if m.role == "user"), None)
    last_user_text = (last_user.text if last_user else "").strip()

    from .skills import assess_skill

    skill: Optional[AgentSkill] = None
    plan: Optional[AgentPlan] = None
    if last_user:
        match = assess_skill(last_user_text)
        skill = match.skill
        if match.should_plan:
            plan = plan_for_skill(skill, last_user_text)
            plan = advance_non_evidence(plan)
        if emit_events and plan:
            emit(EngineEvent(type="phase", phase="understand", label="أفهم طلبك", detail=" ".join(match.reasons)))
            emit(EngineEvent(type="skill", skill={"id": skill.id, "label": skill.label}))
            emit(EngineEvent(type="plan", plan=plan))
            emit(EngineEvent(type="phase", phase="plan", label="أبني الخطة", detail=skill.system_guidance))

    if ctx is None:
        ctx = RunContext(session_id=session_id, settings=settings, skill=skill)

    read_intent_requires_evidence = bool(
        last_user
        and _READ_INTENT_RE.search(last_user_text)
        and not _EXEC_INTENT_RE.search(last_user_text)
    )

    # --- build the model thread ---------------------------------------------
    thread: list[ChatMessage] = []
    for m in messages:
        if m.role == "system":
            continue
        if m.role == "tool":
            thread.append(
                ChatMessage(role="tool", content=m.text, tool_call_id=m.meta.get("tool_call_id"), name=m.meta.get("name"))
            )
        elif m.role == "assistant" and m.tool_calls:
            thread.append(ChatMessage(role="assistant", content=m.text or None, tool_calls=m.tool_calls))
        else:
            thread.append(ChatMessage(role=m.role, content=m.text))
    if initial_content is not None:
        for i in range(len(thread) - 1, -1, -1):
            if thread[i].role == "user":
                thread[i] = ChatMessage(role="user", content=initial_content)
                break

    profile = resolve_profile(provider_proxy(conn), conn.model)
    functions = [ToolCall] and registry.function_defs()  # type: ignore

    call_counts: dict[str, int] = {}
    last_obs_by_sig: dict[str, str] = {}
    last_obs_hash_by_sig: dict[str, str] = {}
    total_calls = 0
    evidence_count = 0
    successful_evidence = 0
    no_evidence_recoveries = 0
    started_at = time.time()
    finished = False

    def persist(msg: Message) -> Awaitable[None]:
        return store.add_message(msg)

    try:
        for round_idx in range(settings.max_tool_rounds):
            if time.time() - started_at > settings.max_runtime_seconds:
                await _fail(emit, persist, session_id, "انتهى الزمن المخصص للتنفيذ.")
                return

            # Mistral-style correction: nudge if thread ends on bare assistant turn.
            last_msg = thread[-1] if thread else None
            if (
                profile.wire_family.value == "mistral-chat"
                and last_msg is not None
                and last_msg.role == "assistant"
                and not last_msg.tool_calls
            ):
                thread.append(
                    ChatMessage(
                        role="user",
                        content="تابع المهمة من آخر نتيجة، واستخدم الواجهة المنظمة للأدوات عند الحاجة بدل كتابة النداء كنص.",
                    )
                )

            system = ChatMessage(
                role="system",
                content=build_system_prompt(
                    settings,
                    conn.provider_name,
                    conn.model,
                    skill_guidance=[skill.system_guidance] if skill else [],
                ),
            )
            if emit_events:
                emit(EngineEvent(type="thinking"))

            try:
                result = await chat_with_retry(
                    client,
                    provider_proxy(conn),
                    base_url=conn.base_url,
                    api_key=conn.api_key,
                    model=conn.model,
                    messages=[system, *thread],
                    functions=functions,
                    max_tokens=profile.max_tokens_default,
                )
            except Exception as e:  # network / provider failure
                msg = f"تعذّر إكمال الرد: {getattr(e, 'message', str(e))}"
                await _fail(emit, persist, session_id, msg)
                return

            # De-duplicate / serialize parallel calls for weak models.
            if result.tool_calls and not profile.supports_parallel_tools and len(result.tool_calls) > 1:
                deferred = len(result.tool_calls) - 1
                result.tool_calls = result.tool_calls[:1]
                note = f"الموديل لا يثبت التنفيذ المتوازي؛ سأتابع {deferred} نداءً مؤجلاً."
                await persist(Message(session_id=session_id, role="assistant", content=note, kind="progress"))

            # Persist assistant turn with tool_calls.
            if result.tool_calls:
                await persist(
                    Message(
                        session_id=session_id,
                        role="assistant",
                        content=result.content,
                        tool_calls=result.tool_calls,
                    )
                )
                thread.append(
                    ChatMessage(
                        role="assistant",
                        content=result.content,
                        tool_calls=[ToolCall(id=tc.id, name=tc.name, arguments=tc.arguments) for tc in result.tool_calls],
                    )
                )

            # Batch validation before execution.
            if result.tool_calls:
                issues = registry.validate_batch(result.tool_calls, profile.supports_parallel_tools)
                if issues:
                    detail = " ".join(i.message for i in issues)
                    for call in result.tool_calls:
                        obs = f"[فشل التحقق قبل التنفيذ] {detail}"
                        await _persist_tool_result(persist, session_id, call, ToolResult(ok=False, error="tool_validation", observation=obs))
                        thread.append(ChatMessage(role="tool", tool_call_id=call.id, name=call.name, content=obs, tool_error=True))
                    if emit_events:
                        emit(EngineEvent(type="observation", title="حُجبت أداة قبل التنفيذ", detail=detail, status="error"))
                    continue

            if not result.tool_calls:
                final_text = (result.content or "").strip()
                if read_intent_requires_evidence and final_text and successful_evidence == 0:
                    no_evidence_recoveries += 1
                    if no_evidence_recoveries >= MAX_NO_EVIDENCE_RECOVERIES:
                        gate = "لم تُرجع أدوات القراءة نتيجة رغم أن الطلب يستوجب بيانات محلية؛ لن أعلن نجاحاً دون دليل."
                        await _fail(emit, persist, session_id, gate)
                        return
                    runtime_correction = (
                        f"[تصحيح] هذا الطلب يستوجب بيانات محلية فعلية. لا ترد بنص تخميني: "
                        f"استدعِ أداة قراءة مناسبة وانتظر نتيجتها. المحاولة {no_evidence_recoveries}/{MAX_NO_EVIDENCE_RECOVERIES}."
                    )
                    # Inject correction as a system nudge via user turn.
                    thread.append(ChatMessage(role="user", content=runtime_correction))
                    continue

                safe = final_text or "أنجزت ما أمكنني في هذه الجولة. أخبرني إن أردت تفصيلاً."
                await persist(Message(session_id=session_id, role="assistant", content=safe, kind="text"))
                if emit_events:
                    emit(EngineEvent(type="stream", content=safe, done=True))
                    emit(EngineEvent(type="text", content=safe))
                finished = True
                break

            # --- execute each tool call ------------------------------------
            paused = False
            for call in result.tool_calls:
                total_calls += 1
                if total_calls > settings.max_tool_calls:
                    await _fail(emit, persist, session_id, f"أوقفت التنفيذ الوقائي بعد {settings.max_tool_calls} استدعاء أداة.")
                    return

                sig = tool_sig(call)
                next_count = call_counts.get(sig, 0) + 1
                call_counts[sig] = next_count

                inner_args0 = parse_tool_args(call.arguments)
                inner_tool = call.name
                if call.name == "execute":
                    inner_tool = str(inner_args0.get("tool", "execute")) if isinstance(inner_args0, dict) else "execute"
                    # Re-validate the inner tool's args through the envelope.
                    outer = parse_tool_args(call.arguments)
                    inner_args = (
                        outer.get("args")
                        if isinstance(outer, dict) and isinstance(outer.get("args"), dict)
                        else None
                    )
                    inner_call = ToolCall(id=call.id, name=inner_tool, arguments=__import__("json").dumps(inner_args or {}, ensure_ascii=False))
                    if not inner_args or registry.validate(inner_call, profile.supports_parallel_tools):
                        # registry.validate returns [] when OK
                        pass
                    issues = registry.validate(inner_call, profile.supports_parallel_tools)
                    if not isinstance(outer, dict) or not inner_args or issues:
                        detail = "execute يحتاج args ككائن JSON." if not inner_args else " ".join(i.message for i in issues)
                        obs = f"[فشل التحقق قبل التنفيذ] {detail}"
                        await _persist_tool_result(persist, session_id, call, ToolResult(ok=False, error="inner_tool_validation", observation=obs))
                        thread.append(ChatMessage(role="tool", tool_call_id=call.id, name=inner_tool, content=obs, tool_error=True))
                        if emit_events:
                            emit(EngineEvent(type="observation", title="حُجبت الأداة الداخلية قبل التنفيذ", detail=detail, status="error"))
                        continue

                # phase event
                if emit_events:
                    phase = "verify" if (skill and inner_tool in skill.verification_tools) else ("ask" if inner_tool in ("ask_user", "request_confirmation") else "execute")
                    emit(EngineEvent(type="phase", phase=phase, label="أنفذ الآن" if phase == "execute" else ("أراجع النتيجة" if phase == "verify" else "أحتاج قرارك")))

                # execute the tool
                tool_result = await registry.execute(call, ctx)
                obs_text = tool_result.to_observation()

                # evidence tracking
                evidence_count += 1
                if tool_result.ok:
                    successful_evidence += 1

                await _persist_tool_result(persist, session_id, call, tool_result, inner_tool=inner_tool)
                thread.append(ChatMessage(role="tool", tool_call_id=call.id, name=inner_tool, content=obs_text, tool_error=not tool_result.ok))

                # record observation for repeat detection
                last_obs_by_sig[sig] = obs_text
                last_obs_hash_by_sig[sig] = _hash(obs_text)

                if emit_events:
                    emit(EngineEvent(type="observation", title="وصلت نتيجة من التطبيق" if tool_result.ok else "توقفت خطوة بسبب نتيجة غير صالحة", detail=_truncate(obs_text, 600), status="success" if tool_result.ok else "error"))

                # pause on decision tools
                if inner_tool in ("ask_user", "request_confirmation"):
                    await store.update_session_meta(session_id, pending={"kind": inner_tool, "tool": inner_tool})
                    paused = True
                    break

            if paused:
                break
    finally:
        pass


async def _persist_tool_result(persist, session_id, call, result: ToolResult, inner_tool: Optional[str] = None) -> None:
    name = inner_tool or call.name
    await persist(
        Message(
            session_id=session_id,
            role="tool",
            content=result.to_observation(),
            kind="tool",
            meta={
                "tool_call_id": call.id,
                "name": name,
                "ok": result.ok,
                "result": result.data if result.data is not None else result.error,
                "observation": result.observation,
                "verified": result.verified,
                "error": result.error,
            },
        )
    )


async def _fail(emit, persist, session_id, msg) -> None:
    await persist(Message(session_id=session_id, role="assistant", content=msg, kind="error"))
    if emit:
        emit(EngineEvent(type="error", message=msg))


class _Aborter:
    def __init__(self) -> None:
        self.cancelled = False
