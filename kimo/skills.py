"""Skill routing + planning (mirrors ``assistant/skills.ts`` +
``assistant/agentContract.ts``).

A *skill* scopes which tools the model may call and which system guidance it
receives. The router is intentionally a light, fast keyword matcher; it can be
replaced by an LLM-based classifier without touching the loop.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

# Verification-tool name heuristic (mirrors executor.isVerificationToolName).
_VERIFICATION_RE = re.compile(
    r"(?:^|_)(?:get|query|list|read|inspect|search|review|verify|integrity|snapshot|summary|tree|schedule|cashflow|financial|schema)(?:$|_)",
    re.IGNORECASE,
)


def is_verification_tool(name: str) -> bool:
    if name in {
        "preview_update",
        "property_change_preview",
        "project_import_preview",
        "inspect_asset",
        "file_preview",
        "read_uploaded_file",
    }:
        return True
    return bool(_VERIFICATION_RE.search(name))


@dataclass
class AgentSkill:
    id: str
    label: str
    description: str
    system_guidance: str = ""
    read_tools: list[str] = field(default_factory=list)
    write_tools: list[str] = field(default_factory=list)
    verification_tools: list[str] = field(default_factory=list)
    recovery_policy: str = "ask_user"  # ask_user | replan | rollback | retry


@dataclass
class PlanStep:
    id: str
    title: str
    status: str = "active"  # active | done | failed
    detail: str = ""


@dataclass
class AgentPlan:
    skill_id: str
    steps: list[PlanStep] = field(default_factory=list)
    current_step_id: Optional[str] = None

    def complete_step(self, step_id: str, note: str = "") -> "AgentPlan":
        for s in self.steps:
            if s.id == step_id:
                s.status = "done"
        active = next((s for s in self.steps if s.status == "active"), None)
        self.current_step_id = active.id if active else None
        return self


# Built-in skills -------------------------------------------------------------

SKILLS: dict[str, AgentSkill] = {
    "project_operations": AgentSkill(
        id="project_operations",
        label="إدارة المشروع العقاري",
        description="شجرة المشروع: مشروع ثم بلوك/مبنى ثم قطعة/وحدة ثم دفعات.",
        system_guidance="تعامل مع المشروع كهرم: اقرأ المستوى الأب قبل إنشاء الابن، لا تكرر الأكواد، ولا تعلن السلامة قبل قراءة integrity أو tree بعد الكتابة.",
        read_tools=["project_tree", "project_financials", "installment_schedule", "payment_ledger", "project_integrity_check", "query", "get"],
        write_tools=["mutate_record", "record_payment"],
        verification_tools=["project_tree", "project_financials", "project_integrity_check"],
    ),
    "project_import": AgentSkill(
        id="project_import",
        label="تنظيم مشروع عقاري",
        description="إدخال مشاريع عقارية عبر معاينة ثم اعتماد ذرّي.",
        system_guidance="تعامل مع الإدخال كتحويل قابل للمراجعة: اكتشف النوع، عاين الصفوف، أصلح الغموض، اعتمد عبر mutate_record، ثم افحص السلامة.",
        read_tools=["project_tree", "project_integrity_check", "get"],
        write_tools=["mutate_record"],
        verification_tools=["project_integrity_check", "get"],
    ),
    "cashflow": AgentSkill(
        id="cashflow",
        label="إدارة الدفعات والتدفقات النقدية",
        description="تسجيل الدفعات ومراجعة التحصيل والفروقات.",
        system_guidance="لا تخمّن أصل الدفعة ولا التاريخ. استخدم record_payment، امنع التجاوز، واعرض التحصيل والفروقات بعد التسجيل.",
        read_tools=["project_financials", "payment_ledger", "installment_schedule", "project_integrity_check"],
        write_tools=["record_payment"],
        verification_tools=["payment_ledger", "project_integrity_check"],
    ),
    "project_review": AgentSkill(
        id="project_review",
        label="مراجعة سلامة المشروع",
        description="تشخيص روابط مفقودة وفروقات قبل الإغلاق.",
        system_guidance="ابدأ بتشخيص قابل للتكرار، افصل الأخطاء المؤكدة عن النواقص، ولا تصلح البيانات تلقائياً قبل توضيح أثر الإصلاح.",
        read_tools=["project_integrity_check", "project_tree", "project_financials"],
        write_tools=["record_payment", "mutate_record"],
        verification_tools=["project_integrity_check"],
    ),
    "reporting": AgentSkill(
        id="reporting",
        label="تحليل وإعداد تقرير",
        description="تقارير وأرقام من قاعدة البيانات.",
        system_guidance="الأرقام يجب أن تأتي من قاعدة البيانات، واذكر النطاق والعملة وحالة أي بيانات غير مكتملة.",
        read_tools=["dashboard_kpis", "project_tree", "project_financials", "query", "get"],
        write_tools=[],
        verification_tools=["dashboard_kpis", "project_integrity_check"],
    ),
    "offer_management": AgentSkill(
        id="offer_management",
        label="إدارة العروض والتنبيهات",
        description="إنشاء العروض وربطها بعقار وعميل.",
        system_guidance="لإنشاء عرض: اقرأ العقار والعميل أولاً عبر query/get، ثم استخدم mutate_record على offers، وأعد القراءة للتحقق. لا تدّعِ إرسال إشعار سحابي.",
        read_tools=["query", "get", "list"],
        write_tools=["mutate_record"],
        verification_tools=["get", "query"],
    ),
    "data_search": AgentSkill(
        id="data_search",
        label="بحث وتنظيم البيانات",
        description="بحث عبر كل الكيانات.",
        system_guidance="ابدأ بالبحث الأوسع عندما لا يحدد المستخدم القسم، ثم ضيّق النتائج ولا تنفذ كتابة ضمنية.",
        read_tools=["query", "get", "list"],
        write_tools=[],
        verification_tools=["query"],
    ),
    "property_management": AgentSkill(
        id="property_management",
        label="إدارة العقارات والوسائط",
        description="إدارة العقارات والوسائط والملفات.",
        system_guidance="افصل دائماً بين سجل العقار وسجل العرض وسجل العميل. تحقق من الحقول الأساسية قبل الكتابة، وأعد القراءة للتحقق بعد الإنشاء/التعديل.",
        read_tools=["query", "get", "list"],
        write_tools=["mutate_record"],
        verification_tools=["get", "query"],
    ),
    "client_relationship": AgentSkill(
        id="client_relationship",
        label="إدارة العملاء والعلاقات",
        description="إنشاء/تعديل/حذف العملاء والبحث عنهم.",
        system_guidance="لا تدمج شخصين متشابهين بالاسم. اعرض المطابقات واطلب تحديداً عند الالتباس. اربط العرض بالعميل عبر المعرف لا عبر النص.",
        read_tools=["query", "get", "list", "buyer_summary"],
        write_tools=["mutate_record"],
        verification_tools=["get", "query"],
    ),
    "campaigns": AgentSkill(
        id="campaigns",
        label="الحملات التسويقية",
        description="إدارة الحملات والتذكيرات.",
        system_guidance="أنشئ الحملة عبر mutate_record ثم تحقق من ارتباطها بالعروض.",
        read_tools=["query", "get", "list"],
        write_tools=["mutate_record"],
        verification_tools=["query", "get"],
    ),
    "workspace_operations": AgentSkill(
        id="workspace_operations",
        label="إدارة الجداول ومساحات العمل",
        description="جداول بيانات ديناميكية (مبسّطة في هذه النسخة).",
        system_guidance="اقرأ بنية الجدول قبل الكتابة، ولا تغيّر أسماء الأعمدة أو تحذف صفوفاً دون طلب صريح.",
        read_tools=["query", "get", "list"],
        write_tools=["mutate_record"],
        verification_tools=["get"],
    ),
    "general_assistant": AgentSkill(
        id="general_assistant",
        label="مساعد عقاري عام",
        description="محادثة عامة وأسئلة حرة لا تتطلب أدوات.",
        system_guidance="كن واضحاً ومباشراً. لا تحوّل السؤال العام إلى عملية كتابة أو استيراد بلا طلب صريح.",
        read_tools=[],
        write_tools=[],
        verification_tools=[],
        recovery_policy="ask_user",
    ),
}

_READ_HINTS = [
    ("project_operations", r"(مشروع|بلوك|قطعة|تقسيط|دفعة|شجرة|مالي|تدفق)"),
    ("cashflow", r"(دفعة|تحصيل|قبض|فاتورة|مبلغ|شراء|أقساط)"),
    ("project_review", r"(سلامة|تشخيص|افحص|مراجعة|تكامل|integrity)"),
    ("reporting", r"(تقرير|إحصاء|مؤشر|لوحة|تحليل|ملخص)"),
    ("offer_management", r"(عرض|تنبيه|إشعار|صفقة)"),
    ("data_search", r"(ابحث|اعثر|كل|جميع|استكشف|بحث)"),
    ("property_management", r"(عقار|وسيط|دلال|وحدة|برج|فيلا|أرض|مساحة)"),
    ("client_relationship", r"(عميل|مشتري|بائع|جهة اتصال|هاتف)"),
    ("campaigns", r"(حملة|تسويق|إعلان)"),
    ("workspace_operations", r"(جدول|مساحة عمل|workspace|صفوف|أعمدة)"),
]


@dataclass
class SkillMatch:
    skill: AgentSkill
    intent: str
    confidence: float
    reasons: list[str]
    should_plan: bool


def assess_skill(goal: str) -> SkillMatch:
    text = (goal or "").strip()
    lower = text.lower()

    # Explicit execution verbs -> planning task.
    execution_re = re.compile(
        r"(?:أنشئ|انشئ|أضف|اضف|عدّل|عدل|حدّث|حدث|احذف|حذف|سجّل|سجل|استورد|استيراد|ذكّر|ذكرني|تذكير|اعتمد|ولّد|ولد|اولد|generate|create|add|update|delete|import)"
    )
    read_re = re.compile(
        r"(?:اعرض|أظهر|اظهر|اقرأ|استكشف|ابحث|اعثر|كم|عدد|إجمالي|ملخص|جدول|شجرة|المؤشرات|التدفقات|الأقساط|الوقت المحلي|تاريخ اليوم|التنبيهات|التدقيق)"
    )
    is_exec = bool(execution_re.search(text)) and not bool(read_re.search(text))
    is_read = bool(read_re.search(text)) and not bool(execution_re.search(text))

    scores: dict[str, float] = {sid: 0.0 for sid in SKILLS}
    reasons: dict[str, list[str]] = {sid: [] for sid in SKILLS}
    for sid, pat in _READ_HINTS:
        if re.search(pat, text):
            scores[sid] += 1.0
            reasons[sid].append(f"تطابق نمط «{sid}»")

    # Ask / clarification.
    if re.search(r"\?$|؟$|ماذا|كيف|لماذا|هل|ما هو|ما هي", text):
        for sid in ("general_assistant", "client_relationship"):
            scores[sid] += 0.4

    best_sid = max(scores, key=lambda s: scores[s])
    best_score = scores[best_sid]

    if best_score == 0.0:
        skill = SKILLS["general_assistant"]
        intent = "general_question" if not is_exec else "general_task"
        should_plan = is_exec
        reasons["general_assistant"].append("لا تطابق مجالي واضح — مساعد عام.")
    else:
        skill = SKILLS[best_sid]
        intent = "execution" if is_exec else ("read" if is_read else "mixed")
        should_plan = True
        if is_exec:
            reasons[best_sid].append("فعل تنفيذي صريح.")

    confidence = min(1.0, 0.4 + best_score * 0.3)
    return SkillMatch(
        skill=skill,
        intent=intent,
        confidence=confidence,
        reasons=reasons[skill.id],
        should_plan=should_plan,
    )


def plan_for_skill(skill: AgentSkill, goal: str) -> AgentPlan:
    """Build a default plan: understand -> (plan) -> execute -> verify."""
    steps = [
        PlanStep(id="understand", title="فهم المطلوب وتحديد النطاق"),
        PlanStep(id="plan", title="بناء خطة العمل الداخلية"),
        PlanStep(id="execute", title="تنفيذ خطوات الأدوات"),
        PlanStep(id="verify", title="التحقق من النتيجة الفعلية"),
    ]
    if skill.id == "general_assistant":
        steps = [PlanStep(id="answer", title="الإجابة المباشرة")]
    plan = AgentPlan(skill_id=skill.id, steps=steps)
    plan.current_step_id = steps[0].id if steps else None
    return plan


def advance_non_evidence(plan: AgentPlan) -> AgentPlan:
    """Auto-complete non-evidence plan steps (mirrors executor logic)."""
    non_evidence = {"understand", "plan", "answer", "present", "decide"}
    while plan.current_step_id:
        active = next((s for s in plan.steps if s.id == plan.current_step_id), None)
        if not active or active.id not in non_evidence or active.status == "done":
            break
        plan = plan.complete_step(active.id, "تحديد المرحلة ضمن قرار الوكيل.")
    return plan
