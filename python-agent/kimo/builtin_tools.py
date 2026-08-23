"""Built-in, provider-agnostic tools (safe defaults the engine ships with).

Domain tools (CRUD over a database, project tree, analytics...) are expected to
be registered by the host app against the same :class:`Registry`, usually backed
by a :class:`~kimo.tools.ToolBackend`.
"""

from __future__ import annotations

import datetime
from typing import Any

from .tools import Registry, ToolArg, ToolResult


def register_builtins(registry: Registry) -> None:
    @registry.register_handler(
        "current_local_time",
        "إرجاع التاريخ والوقت المحليين الحاليين (للتحقق من المواعيد).",
        [],
        lambda args, ctx: ToolResult(ok=True, data={"iso": datetime.datetime.now().isoformat(), "epoch": int(datetime.datetime.now().timestamp())}, observation=f"الوقت المحلي: {datetime.datetime.now().isoformat()}"),
        read_only=True,
        category="system",
        verification=True,
    )
    def _current_time(args: dict, ctx: Any) -> ToolResult:
        return ToolResult(
            ok=True,
            data={"iso": datetime.datetime.now().isoformat(), "epoch": int(datetime.datetime.now().timestamp())},
            observation=f"الوقت المحلي الحالي: {datetime.datetime.now().isoformat()}",
        )

    @registry.register_handler(
        "echo",
        "أداة مساعدة لإعادة أي قيمة مرفقة (مفيدة للتشخيص).",
        [ToolArg(name="value", type="string", description="النص المراد إعادته")],
        lambda args, ctx: ToolResult(ok=True, data=args, observation=str(args.get("value", ""))),
        read_only=True,
        category="system",
    )
    def _echo(args: dict, ctx: Any) -> ToolResult:
        return ToolResult(ok=True, data=args, observation=str(args.get("value", "")))

    @registry.register_handler(
        "ask_user",
        "اطلب معلومة من المستخدم قبل المتابعة (لن يخمّن الوكيل).",
        [ToolArg(name="question", type="string", description="السؤال الموجّه للمستخدم", required=True)],
        lambda args, ctx: ToolResult(ok=True, data={"question": args.get("question")}, observation=f"سؤال للمستخدم: {args.get('question')}"),
        read_only=True,
        category="dialogue",
    )
    def _ask_user(args: dict, ctx: Any) -> ToolResult:
        return ToolResult(ok=True, data={"question": args.get("question")}, observation=f"سألت المستخدم: {args.get('question')}")

    @registry.register_handler(
        "request_confirmation",
        "اطلب موافقة صريحة من المستخدم قبل إجراء حسّاس (حذف/تعديل مالي).",
        [
            ToolArg(name="title", type="string", description="عنوان الطلب", required=True),
            ToolArg(name="detail", type="string", description="تفاصيل ما سيُنفّذ عند الموافقة"),
        ],
        lambda args, ctx: ToolResult(ok=True, data={"title": args.get("title"), "detail": args.get("detail")}, observation=f"طلب تأكيد: {args.get('title')}"),
        read_only=True,
        category="dialogue",
    )
    def _request_confirmation(args: dict, ctx: Any) -> ToolResult:
        return ToolResult(ok=True, data={"title": args.get("title"), "detail": args.get("detail")}, observation=f"طلب تأكيد: {args.get('title')}")

    # The `execute` envelope lets the model group a tool under a uniform
    # contract; the loop re-validates and routes to the inner tool.
    @registry.register_handler(
        "execute",
        "غلاف موحّد لتشغيل أداة داخلية: { tool: <الاسم>, args: <الوسائط> }.",
        [
            ToolArg(name="tool", type="string", description="اسم الأداة الداخلية", required=True),
            ToolArg(name="args", type="object", description="وسائط الأداة الداخلية", required=True),
        ],
        lambda args, ctx: ToolResult(ok=False, error="envelope", observation="الغلاف لا يُنفّذ مباشرةً؛ تُوجَّه النداء للأداة الداخلية."),
        read_only=False,
        category="system",
    )
    def _execute(args: dict, ctx: Any) -> ToolResult:
        return ToolResult(ok=False, error="envelope", observation="الغلاف لا يُنفّذ مباشرةً.")
