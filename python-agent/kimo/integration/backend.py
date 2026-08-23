"""Integration backend — wires the Kimo engine to the real domain via
:class:`SqliteStore` + the analytics layer.

Exposes the *same* tool surface the original runtime offered to the model
(``query`` / ``get`` / ``mutate_record`` / ``list`` plus the project analytics)
so an agent can be swapped from the TS engine to this Python engine with no
prompt changes.
"""

from __future__ import annotations

import json
from typing import Any

from ..tools import Registry, ToolArg
from .analytics import (
    buyer_summary,
    dashboard_kpis,
    installment_schedule,
    payment_ledger,
    project_financials,
    project_integrity_check,
    project_tree,
    record_payment,
)
from .store import QuerySpec, SqliteStore

ALL_ENTITY_KEYS = [
    "properties", "clients", "offers", "campaigns", "viewings", "waypoints",
    "areas", "projects", "blocks", "plots", "plot_payments",
    "custom_fields", "custom_field_values",
]


def _ok(data: Any) -> dict:
    return {"ok": True, "data": data}


def _fail(msg: str) -> dict:
    return {"ok": False, "error": msg}


def build_integration_registry(store: SqliteStore) -> Registry:
    reg = Registry()

    def h_query(args, ctx):
        spec = QuerySpec(
            entity=args["entity"],
            search=args.get("search"),
            filters=args.get("filters"),
            sort=args.get("sort"),
            limit=int(args.get("limit", 2000)),
            offset=int(args.get("offset", 0)),
        )
        return _ok(store.query(spec))

    reg.register_handler(
        "query", "استعلام مرن عن أي كيان مع فلاتر وبحث وتصنيف.",
        [
            ToolArg("entity", "string", "اسم الكيان (properties, clients, projects, plots...).", required=True, enum=ALL_ENTITY_KEYS),
            ToolArg("search", "string", "نص للبحث الحرّ."),
            ToolArg("filters", "array", "قائمة شروط التصفية [{field,op,value}]."),
            ToolArg("sort", "object", "{field, dir}."),
            ToolArg("limit", "integer", "الحد الأقصى للنتائج (افتراض 2000)."),
            ToolArg("offset", "integer", "إزاحة التصفح."),
        ],
        h_query, read_only=True, category="data",
    )

    def h_get(args, ctx):
        row = store.get(args["entity"], args["id"])
        if row is None:
            return _fail("السجل غير موجود.")
        return _ok(row)

    reg.register_handler(
        "get", "جلب سجل واحد بالمعرّف.",
        [
            ToolArg("entity", "string", "اسم الكيان.", required=True, enum=ALL_ENTITY_KEYS),
            ToolArg("id", "string", "معرّف السجل.", required=True),
        ],
        h_get, read_only=True, category="data",
    )

    def h_list(args, ctx):
        spec = QuerySpec(
            entity=args["entity"],
            search=args.get("search"),
            limit=int(args.get("limit", 200)),
            offset=int(args.get("offset", 0)),
        )
        return _ok(store.query(spec))

    reg.register_handler(
        "list", "تصفّح سجلات كيان مع ترقيم.",
        [
            ToolArg("entity", "string", "اسم الكيان.", required=True, enum=ALL_ENTITY_KEYS),
            ToolArg("search", "string", "نص بحث اختياري."),
            ToolArg("limit", "integer", "عدد النتائج (افتراض 200)."),
            ToolArg("offset", "integer", "إزاحة."),
        ],
        h_list, read_only=True, category="data",
    )

    def h_mutate(args, ctx):
        action = args.get("action", "create")
        entity = args["entity"]
        try:
            if action == "create":
                return _ok(store.create(entity, args.get("data") or {}))
            if action == "update":
                return _ok(store.update(entity, args["id"], args.get("data") or {}))
            if action == "delete":
                return _ok(store.delete(entity, args["id"]))
        except ValueError as e:
            return _fail(str(e))
        return _fail("إجراء غير مدعوم؛ استخدم create/update/delete.")

    reg.register_handler(
        "mutate_record", "إنشاء/تعديل/حذف سجل في أي كيان.",
        [
            ToolArg("entity", "string", "اسم الكيان.", required=True, enum=ALL_ENTITY_KEYS),
            ToolArg("action", "string", "create | update | delete.", required=True, enum=["create", "update", "delete"]),
            ToolArg("id", "string", "معرّف السجل (مطلوب للتعديل/الحذف)."),
            ToolArg("data", "object", "الحقول للإنشاء/التعديل."),
        ],
        h_mutate, read_only=False, category="data",
    )

    async def h_tree(args, ctx):
        return _ok(await project_tree(store, args["project_ref"]))

    reg.register_handler(
        "project_tree", "شجرة المشروع كاملة: مشروع ← بلوكات ← قطع ← دفعات.",
        [ToolArg("project_ref", "string", "معرّف المشروع.", required=True)],
        h_tree, read_only=True, category="projects",
    )

    async def h_fin(args, ctx):
        return _ok(await project_financials(store, args["project_ref"]))

    reg.register_handler(
        "project_financials", "ملخّص مالي للمشروع (قيم، محصّل، متبقّي).",
        [ToolArg("project_ref", "string", "معرّف المشروع.", required=True)],
        h_fin, read_only=True, category="projects",
    )

    async def h_inst(args, ctx):
        return _ok(await installment_schedule(store, args["plot_ref"]))

    reg.register_handler(
        "installment_schedule", "جدول أقساط قطعة مع ملخّص مدفوع/متبقّي.",
        [ToolArg("plot_ref", "string", "معرّف القطعة.", required=True)],
        h_inst, read_only=True, category="projects",
    )

    async def h_buyer(args, ctx):
        return _ok(await buyer_summary(store, args["client_ref"]))

    reg.register_handler(
        "buyer_summary", "ملخّص مشترٍ: قطعه ومدفوعاته ومتبقّيه.",
        [ToolArg("client_ref", "string", "معرّف العميل.", required=True)],
        h_buyer, read_only=True, category="projects",
    )

    async def h_ledger(args, ctx):
        return _ok(await payment_ledger(store, args["entity_type"], args["entity_ref"]))

    reg.register_handler(
        "payment_ledger", "دفتر مدفوعات لقطعة أو عميل.",
        [
            ToolArg("entity_type", "string", "plot | client.", required=True, enum=["plot", "client"]),
            ToolArg("entity_ref", "string", "معرّف الكيان.", required=True),
        ],
        h_ledger, read_only=True, category="projects",
    )

    async def h_kpis(args, ctx):
        return _ok(await dashboard_kpis(store))

    reg.register_handler(
        "dashboard_kpis", "مؤشرات لوحة التحكم عبر كل الكيانات.",
        [], h_kpis, read_only=True, category="projects",
    )

    return reg
