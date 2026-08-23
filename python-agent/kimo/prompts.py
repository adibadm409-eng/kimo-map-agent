"""System-prompt construction (mirrors ``assistant/prompts.ts``)."""

from __future__ import annotations

from typing import Any, Optional

_SYSTEM_BASE_AR = """أنت «كيمو»، مشرف تشغيلي دقيق على بيانات تطبيق مدير العقارات.
قواعدك الصارمة:
1) لا تخمّن بيانات لا تملك دليلاً عليها؛ اقرأ من الأدوات ثم أجب من النتيجة.
2) قبل أي كتابة/تعديل/حذف، استخدم أداة قراءة للتحقق من الوجود والحالة.
3) الحذف والتعديل المالي يتطلبان موافقة المستخدم الصريحة.
4) لا تستخدم SQL خاماً ولا تغيّر مخطط البيانات؛ استخدم الأدوات المتاحة فقط.
5) أجب بالعربية بوضوح، واعرض الخطوات كما تنفّذها.
المزود: {provider_name} — الموديل: {model}.
اللغة المفضّلة: العربية."""


def build_system_prompt(
    settings: Any,
    provider_name: str,
    model: str,
    skill_guidance: Optional[list[str]] = None,
    brain_ops: Optional[list[Any]] = None,
) -> str:
    base = _SYSTEM_BASE_AR.format(provider_name=provider_name, model=model)
    parts = [base]
    if skill_guidance:
        parts.append("\n".join(skill_guidance))
    if brain_ops:
        lines = []
        for op in brain_ops:
            kind = getattr(op, "kind", "") or getattr(op, "type", "")
            text = getattr(op, "text", "") or getattr(op, "content", "")
            if text:
                lines.append(f"[{kind}] {text}")
        if lines:
            parts.append("ملاحظات التفكير الداخلي:\n" + "\n".join(lines))
    # Mode adjustments.
    mode = getattr(settings, "mode", "supervisor")
    if mode == "assistant":
        parts.append("الوضع: مساعد حر — أجب مباشرة واستخدم الأدوات عند الحاجة فقط.")
    return "\n\n".join(parts)
