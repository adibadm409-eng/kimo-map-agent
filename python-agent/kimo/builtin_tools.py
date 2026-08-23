"""Built-in, provider-agnostic tools (safe defaults the engine ships with).

Domain tools (CRUD over a database, project tree, analytics...) are expected to
be registered by the host app against the same :class:`Registry`, usually backed
by a :class:`~kimo.tools.ToolBackend`.
"""

from __future__ import annotations

import datetime
from typing import Any

from .tools import Registry, ToolArg, ToolResult


def _current_time(args: dict, ctx: Any) -> ToolResult:
    now = datetime.datetime.now()
    return ToolResult(
        ok=True,
        data={"iso": now.isoformat(), "epoch": int(now.timestamp())},
        observation=f"الوقت المحلي الحالي: {now.isoformat()}",
    )


def _echo(args: dict, ctx: Any) -> ToolResult:
    return ToolResult(ok=True, data=args, observation=str(args.get("value", "")))


def _ask_user(args: dict, ctx: Any) -> ToolResult:
    return ToolResult(
        ok=True,
        data={"question": args.get("question")},
        observation=f"سألت المستخدم: {args.get('question')}",
    )


def _request_confirmation(args: dict, ctx: Any) -> ToolResult:
    return ToolResult(
        ok=True,
        data={"title": args.get("title"), "detail": args.get("detail")},
        observation=f"طلب تأكيد: {args.get('title')}",
    )


def _execute(args: dict, ctx: Any) -> ToolResult:
    return ToolResult(ok=False, error="envelope", observation="الغلاف لا يُنفّذ مباشرةً.")


def register_builtins(registry: Registry) -> None:
    registry.register_handler(
        "current_local_time",
        "إرجاع التاريخ والوقت المحليين الحاليين (للتحقق من المواعيد).",
        [],
        _current_time,
        read_only=True,
        category="system",
        verification=True,
    )
    registry.register_handler(
        "echo",
        "أداة مساعدة لإعادة أي قيمة مرفقة (مفيدة للتشخيص).",
        [ToolArg(name="value", type="string", description="النص المراد إعادته")],
        _echo,
        read_only=True,
        category="system",
    )
    registry.register_handler(
        "ask_user",
        "اطلب معلومة من المستخدم قبل المتابعة (لن يخمّن الوكيل).",
        [ToolArg(name="question", type="string", description="السؤال الموجّه للمستخدم", required=True)],
        _ask_user,
        read_only=True,
        category="dialogue",
    )
    registry.register_handler(
        "request_confirmation",
        "اطلب موافقة صريحة من المستخدم قبل إجراء حسّاس (حذف/تعديل مالي).",
        [
            ToolArg(name="title", type="string", description="عنوان الطلب", required=True),
            ToolArg(name="detail", type="string", description="تفاصيل ما سيُنفّذ عند الموافقة"),
        ],
        _request_confirmation,
        read_only=True,
        category="dialogue",
    )
    # The `execute` envelope lets the model group a tool under a uniform
    # contract; the loop re-validates and routes to the inner tool.
    registry.register_handler(
        "execute",
        "غلاف موحّد لتشغيل أداة داخلية: { tool: <الاسم>, args: <الوسائط> }.",
        [
            ToolArg(name="tool", type="string", description="اسم الأداة الداخلية", type_ := "string"),
            ToolArg(name="args", type="object", description="وسائط الأداة الداخلية", required=True),
        ],
        _execute,
        read_only=False,
        category="system",
    )
