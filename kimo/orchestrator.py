"""Agent Worker — an aware, skillful orchestrator.

Unlike a rigid rule-based system, this orchestrator:
  1. Knows its tools (reads the registry to understand what's available)
  2. Has planning skills (understand → decompose → execute → verify)
  3. Uses the LLM to decompose complex goals into steps
  4. Adapts to any request type, not just pre-programmed patterns

Architecture:
  User goal → Orchestrator.analyze()
    → Build tool awareness context
    → LLM decomposes goal into steps (or fast-path for simple requests)
    → TaskPlan
  TaskPlan → Orchestrator.execute_plan()
    → For each step: focused engine round → record result → next
  Incomplete plan → Orchestrator.resume() → continue from where we left off
"""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Optional

from .types import EngineEvent


# ── data types ──────────────────────────────────────────────────────────────


class StepStatus(str, Enum):
    PENDING = "pending"
    ACTIVE = "active"
    DONE = "done"
    FAILED = "failed"
    SKIPPED = "skipped"


class PlanStatus(str, Enum):
    DRAFT = "draft"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class StepResult:
    ok: bool = False
    output: str = ""
    error: str = ""
    evidence: list[dict] = field(default_factory=list)


@dataclass
class TaskStep:
    id: str
    title: str
    description: str = ""
    intent: str = ""          # read | write | verify | ask | general
    tool_hint: str = ""       # suggested tool (or empty)
    status: StepStatus = StepStatus.PENDING
    result: Optional[StepResult] = None
    started_at: Optional[int] = None
    finished_at: Optional[int] = None


@dataclass
class TaskPlan:
    id: str
    session_id: str
    goal: str
    steps: list[TaskStep] = field(default_factory=list)
    current_step_index: int = 0
    status: PlanStatus = PlanStatus.DRAFT
    created_at: int = field(default_factory=lambda: int(time.time() * 1000))
    updated_at: int = field(default_factory=lambda: int(time.time() * 1000))

    @property
    def current_step(self) -> Optional[TaskStep]:
        if 0 <= self.current_step_index < len(self.steps):
            return self.steps[self.current_step_index]
        return None

    @property
    def is_complete(self) -> bool:
        return self.status in (PlanStatus.COMPLETED, PlanStatus.FAILED)

    @property
    def progress_pct(self) -> int:
        if not self.steps:
            return 0
        done = sum(1 for s in self.steps if s.status in (StepStatus.DONE, StepStatus.SKIPPED))
        return int(done / len(self.steps) * 100)

    def advance(self) -> Optional[TaskStep]:
        for i, s in enumerate(self.steps):
            if s.status == StepStatus.PENDING:
                s.status = StepStatus.ACTIVE
                s.started_at = int(time.time() * 1000)
                self.current_step_index = i
                self.updated_at = int(time.time() * 1000)
                return s
        self.status = PlanStatus.COMPLETED
        self.updated_at = int(time.time() * 1000)
        return None

    def complete_current(self, result: StepResult) -> None:
        step = self.current_step
        if step:
            step.result = result
            step.status = StepStatus.DONE if result.ok else StepStatus.FAILED
            step.finished_at = int(time.time() * 1000)
        if not result.ok:
            self.status = PlanStatus.FAILED
        self.updated_at = int(time.time() * 1000)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "session_id": self.session_id,
            "goal": self.goal,
            "status": self.status.value,
            "current_step_index": self.current_step_index,
            "progress_pct": self.progress_pct,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "steps": [
                {
                    "id": s.id,
                    "title": s.title,
                    "description": s.description,
                    "intent": s.intent,
                    "tool_hint": s.tool_hint,
                    "status": s.status.value,
                    "result": {
                        "ok": s.result.ok,
                        "output": s.result.output[:200],
                        "error": s.result.error,
                    } if s.result else None,
                }
                for s in self.steps
            ],
        }


# ── tool awareness ──────────────────────────────────────────────────────────


def build_tool_awareness(registry: Any) -> str:
    """Read the registry and build a human-readable summary of available tools.

    This is what makes the orchestrator *aware* — it knows exactly what tools
    exist, what they do, and what parameters they accept.
    """
    lines = ["الأدوات المتاحة في نظام إدارة العقارات:\n"]
    for name in sorted(registry.names()):
        tool = registry.get(name)
        if tool is None:
            continue
        desc = tool.description
        params = []
        for arg in tool.args:
            tag = "مطلوب" if arg.required else "اختياري"
            params.append(f"  - {arg.name} ({arg.type}, {tag}): {arg.description}")
        lines.append(f"• {name}: {desc}")
        if params:
            lines.append("\n".join(params))
        lines.append("")
    return "\n".join(lines)


def build_environment_context() -> str:
    """Describe the environment the agent operates in."""
    return """بيئة العمل: تطبيق "مدير العقارات" — قاعدة بيانات SQLite محلية تحتوي:
- عقارات (properties): اسم، نوع، موقع، مساحة، سعر
- عملاء (clients): اسم، هاتف، بريد
- مشاريع (projects): اسم، وصف، حالة
- بلوكات (blocks): اسم، مشروع، عدد الطوابق
- قطع (units): رقم، بلوك، مساحة، سعر، حالة
- أقساط (installments): مشروع، قسط، مبلغ، تاريخ استحقاق
- دفعات (payments): مشروع، مبلغ، تاريخ، عميل، وسيلة الدفع
- عروض (offers): عقار، عميل، سعر، حالة
- حملات (campaigns): اسم، وصف، حالة

الأدوات المتاحة for CRUD: query, get, list, mutate_record
الأدوات المالية: record_payment, installment_schedule, payment_ledger, project_financials
الأدوات التحليلية: dashboard_kpis, buyer_summary, project_tree, project_integrity_check
أدوات الحوار: ask_user, request_confirmation
"""


# ── planning skill ──────────────────────────────────────────────────────────


def build_planning_prompt(goal: str, tool_awareness: str, env_context: str) -> str:
    """Build the LLM prompt for goal decomposition.

    This is the core of the planning skill — it teaches the LLM how to
    think about decomposing a goal into executable steps.
    """
    return f"""أنت مُنسّق مهام ذكي في تطبيق إدارة العقارات.
مهمتك: حلّل الطلب التالي إلى خطوات تنفيذية متسلسلة.

{env_context}

{tool_awareness}

---

الطلب: {goal}

---

تعليمات التفكيك:
1. افهم الطلبornado: ماذا يريد المستخدم فعلاً؟ هل هو طلب واحد أم عدة طلبات؟
2. حدد العمليات: كل خطوة يجب أن تكون عملية واحدة واضحة (قراءة، كتابة، حذف، تحقق، سؤال).
3. نظّم الترتيب: الخطوات التي تعتمد على بعضها يجب أن تأتي بالترتيب الصحيح.
4. لا تُسرف: لا ت créer خطوات زائدة. كل خطوة يجب أن تضيف قيمة حقيقية.
5. التحقق: إذا كان الطلب يشمل تعديلاً أو حذفاً، أضف خطوة تحقق في النهاية.

أعد الناتج كـ JSON حصرياً (بدون نص إضافي قبل أو بعد):
{{
  "analysis": "تحليل موجز للطلب (جملة واحدة)",
  "steps": [
    {{
      "title": "عنوان الخطوة",
      "description": "وصف دقيق لما يجب فعله",
      "intent": "read|write|verify|ask|general",
      "tool_hint": "اسم الأداة المقترح (أو فارغ إذا لم تكن محددة)"
    }}
  ]
}}

ملاحظات:
- intent="read" للاستعلام والعرض
- intent="write" للإنشاء والتعديل
- intent="verify" للتحقق بعد تعديل
- intent="ask" لطلب إدخال من المستخدم
- intent="general" للأسئلة العامة التي لا تتطلب أدوات
- لا تستخدم npm أو أوامر خارجية
- إذا كان الطلب بسيطاً (سؤال عام، عرض 단รายการ)، أعد خطوة واحدة فقط
"""


# ── orchestrator ────────────────────────────────────────────────────────────


class Orchestrator:
    """Agent Worker — aware, skillful, adaptive.

    Knows its tools via the registry, plans via LLM, executes step by step.

    Usage::

        orch = Orchestrator(engine)
        plan = await orch.analyze(session_id, "سجّل دفعة 50000 لمشروع النور")
        summary = await orch.execute_plan(plan, emit=emit_fn)
    """

    def __init__(self, engine: Any) -> None:
        self._engine = engine
        self._active_plans: dict[str, TaskPlan] = {}

    def get_plan(self, session_id: str) -> Optional[TaskPlan]:
        return self._active_plans.get(session_id)

    async def analyze(self, session_id: str, goal: str) -> TaskPlan:
        """Decompose a user goal into a TaskPlan.

        For simple requests (single action, question), returns a single-step
        plan that goes directly through the engine.

        For complex requests, uses LLM decomposition with full tool awareness.
        """
        from .session import gen_id

        plan_id = gen_id("plan_")

        # Build awareness context
        tool_awareness = build_tool_awareness(self._engine.registry)
        env_context = build_environment_context()

        # Ask LLM to decompose
        prompt = build_planning_prompt(goal, tool_awareness, env_context)
        steps = await self._llm_decompose(prompt)

        plan = TaskPlan(
            id=plan_id,
            session_id=session_id,
            goal=goal,
            steps=steps,
            status=PlanStatus.DRAFT,
        )
        if steps:
            steps[0].status = StepStatus.ACTIVE
            steps[0].started_at = int(time.time() * 1000)
        self._active_plans[session_id] = plan
        return plan

    async def execute_plan(
        self,
        plan: TaskPlan,
        *,
        emit: Optional[Callable[[EngineEvent], None]] = None,
    ) -> dict:
        """Execute all steps in a plan sequentially."""
        if emit is None:
            emit = lambda e: None

        plan.status = PlanStatus.RUNNING
        results: list[dict] = []

        while not plan.is_complete:
            step = plan.advance()
            if step is None:
                break

            emit(EngineEvent(
                type="phase",
                phase="execute",
                label=f"خطوة {plan.current_step_index + 1}/{len(plan.steps)}: {step.title}",
                detail=step.description,
            ))

            step_result = await self._execute_step(plan, step, emit)
            plan.complete_current(step_result)

            results.append({
                "step": step.title,
                "ok": step_result.ok,
                "output": step_result.output[:300] if step_result.output else "",
                "error": step_result.error,
            })

            if not step_result.ok and step.intent in ("write", "verify"):
                plan.status = PlanStatus.FAILED
                emit(EngineEvent(
                    type="error",
                    message=f"فشلت الخطوة «{step.title}»: {step_result.error or 'خطأ غير معروف'}",
                ))
                break

        if plan.status == PlanStatus.RUNNING:
            plan.status = PlanStatus.COMPLETED

        emit(EngineEvent(
            type="phase",
            phase="complete",
            label="اكتملت الخطة",
            detail=f"التقدم: {plan.progress_pct}% — الحالة: {plan.status.value}",
        ))

        return self._build_summary(plan, results)

    async def resume(
        self,
        session_id: str,
        *,
        emit: Optional[Callable[[EngineEvent], None]] = None,
    ) -> Optional[dict]:
        """Resume an incomplete plan for a session."""
        plan = self._active_plans.get(session_id)
        if plan is None or plan.is_complete:
            return None
        return await self.execute_plan(plan, emit=emit)

    async def _llm_decompose(self, prompt: str) -> list[TaskStep]:
        """Use the LLM to decompose a goal into steps.

        Sends the planning prompt as a user message to the engine's LLM,
        parses the structured JSON response.
        """
        from .session import gen_id

        collected_content = ""

        def on_event(e: EngineEvent) -> None:
            nonlocal collected_content
            if e.type == "text" and e.content:
                collected_content = e.content

        off = self._engine.on_event(on_event)
        try:
            # Use a temporary session to avoid polluting the main conversation
            tmp_session = await self._engine.create_session(title="planning")
            await self._engine.send_user_message(tmp_session.id, prompt)
        except Exception:
            return self._fallback_single_step("تعذر تحليل الطلب عبر النموذج")
        finally:
            off()

        # Parse the LLM response
        return self._parse_steps_response(collected_content)

    def _parse_steps_response(self, response: str) -> list[TaskStep]:
        """Parse the LLM's JSON response into TaskStep objects."""
        text = response.strip()

        # Strip markdown fences if present
        fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)
        if fence:
            text = fence.group(1).strip()

        # Try to find JSON object
        start = text.find("{")
        if start == -1:
            return self._fallback_single_step("الرد غير المهيكل")

        depth = 0
        end = start
        for i in range(start, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break

        try:
            data = json.loads(text[start:end])
        except (json.JSONDecodeError, ValueError):
            return self._fallback_single_step("تعذر تحليل بنية الرد")

        raw_steps = data.get("steps", [])
        if not raw_steps:
            return self._fallback_single_step("لم يتم توليد خطوات")

        steps = []
        for i, raw in enumerate(raw_steps):
            steps.append(TaskStep(
                id=self._make_step_id(i, raw.get("title", f"خطوة {i+1}")),
                title=raw.get("title", f"خطوة {i+1}"),
                description=raw.get("description", ""),
                intent=raw.get("intent", "general"),
                tool_hint=raw.get("tool_hint", ""),
            ))
        return steps

    def _fallback_single_step(self, reason: str) -> list[TaskStep]:
        """Fallback: single step that passes the goal directly to the engine."""
        return [TaskStep(
            id="step_0_direct",
            title="تنفيذ الطلب مباشرة",
            description=reason,
            intent="general",
        )]

    def _make_step_id(self, index: int, title: str) -> str:
        slug = re.sub(r"[^\w\u0600-\u06FF]+", "_", title.lower()).strip("_")[:20]
        return f"step_{index}_{slug}"

    async def _execute_step(
        self,
        plan: TaskPlan,
        step: TaskStep,
        emit: Callable[[EngineEvent], None],
    ) -> StepResult:
        """Execute a single step by running a focused engine round."""
        step_prompt = self._build_step_prompt(plan, step)

        collected_observations: list[str] = []
        final_text = ""

        def on_event(e: EngineEvent) -> None:
            if e.type == "observation" and e.detail:
                collected_observations.append(e.detail)
            if e.type == "text" and e.content:
                nonlocal final_text
                final_text = e.content

        off = self._engine.on_event(on_event)
        try:
            await self._engine.send_user_message(plan.session_id, step_prompt)
        except Exception as exc:
            return StepResult(ok=False, error=str(exc))
        finally:
            off()

        ok = bool(collected_observations) or bool(final_text)
        output = final_text or "\n".join(collected_observations)
        error = "" if ok else "لم تُرجع أي نتيجة"

        return StepResult(ok=ok, output=output, error=error)

    def _build_step_prompt(self, plan: TaskPlan, step: TaskStep) -> str:
        """Build a focused user message for a single step."""
        parts = [
            f"[خطة العمل — الخطوة {plan.current_step_index + 1} من {len(plan.steps)}]",
            f"الهدف الكلي: {plan.goal}",
            "",
            f"الخطوة الحالية: {step.title}",
        ]
        if step.description:
            parts.append(f"التفاصيل: {step.description}")
        if step.tool_hint:
            parts.append(f"الأداة المقترحة: {step.tool_hint}")
        parts.append("")
        parts.append("نفّذ هذه الخطوة فقط ثم أبلغ عن النتيجة.")
        return "\n".join(parts)

    def _build_summary(self, plan: TaskPlan, results: list[dict]) -> dict:
        return {
            "plan_id": plan.id,
            "goal": plan.goal,
            "status": plan.status.value,
            "progress_pct": plan.progress_pct,
            "total_steps": len(plan.steps),
            "completed_steps": sum(
                1 for s in plan.steps if s.status in (StepStatus.DONE, StepStatus.SKIPPED)
            ),
            "steps": results,
        }


# ── convenience ─────────────────────────────────────────────────────────────


async def orchestrate(
    engine: Any,
    session_id: str,
    goal: str,
    *,
    emit: Optional[Callable[[EngineEvent], None]] = None,
) -> dict:
    """One-shot convenience: analyze + execute a plan."""
    orch = Orchestrator(engine)
    plan = await orch.analyze(session_id, goal)
    return await orch.execute_plan(plan, emit=emit)
