"""Intent analysis + conversation context summary (mirrors ``assistant/intent.ts``)."""

from __future__ import annotations

import re
from typing import Optional

_INTENT_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("create", re.compile(r"(أنشئ|انشئ|أضف|اضف|سجّل|سجل|استورد|استيراد|ولّد|ولد|إنشاء)")),
    ("update", re.compile(r"(عدّل|عدل|حدّث|حدث|غيّر|غير|تعديل)")),
    ("delete", re.compile(r"(احذف|حذف|إزالة|ازالة|شيل|احذفهم)")),
    ("read", re.compile(r"(اعرض|أظهر|اظهر|اقرأ|استعرض|ابحث|اعثر|كم|عدد|إجمالي|ملخص|جدول)")),
    ("ask", re.compile(r"(\?$|؟$|ماذا|كيف|لماذا|هل|ما هو|ما هي)")),
]


def analyze_intent(text: str) -> Optional[str]:
    for label, pat in _INTENT_PATTERNS:
        if pat.search(text or ""):
            return label
    return None


def build_context_summary(messages: list) -> str:
    """Summarise recent turns into a short context line for the system prompt."""
    recent = [m for m in messages if getattr(m, "role", None) in ("user", "assistant")][-6:]
    if not recent:
        return ""
    parts = []
    for m in recent:
        role = "المستخدم" if m.role == "user" else "المساعد"
        content = m.text if hasattr(m, "text") else str(getattr(m, "content", ""))
        parts.append(f"{role}: {content[:120]}")
    return "آخر المحادثة:\n" + "\n".join(parts)
