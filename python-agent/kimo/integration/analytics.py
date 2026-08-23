"""Project & analytics engine — faithful Python port of ``src/agent/analytics.ts``.

Operates on :class:`SqliteStore`. All functions are plain ``async`` so they drop
into the tool backend uniformly, but they execute synchronous SQLite reads.
"""

from __future__ import annotations

import json
from typing import Any

from .store import QuerySpec, SqliteStore

CHUNK = 400


def _num(v: Any) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


async def project_tree(store: SqliteStore, project_ref: str) -> dict[str, Any]:
    project = store.get("projects", project_ref)
    if not project:
        raise ValueError(f"المشروع غير موجود: {project_ref}")
    blocks = store.query(QuerySpec(entity="blocks", filters=[{"field": "project_id", "op": "eq", "value": project_ref}], sort={"field": "created_at", "dir": "asc"}, limit=2000))["rows"]
    block_ids = [b["id"] for b in blocks]
    plots = _chunked(store, "plots", "block_id", block_ids, sort={"field": "plot_no", "dir": "asc"}, with_custom=True)
    plot_ids = [p["id"] for p in plots]
    payments = _chunked(store, "plot_payments", "plot_id", plot_ids, sort={"field": "pay_date", "dir": "asc"})
    by_block: dict[str, list[dict]] = {}
    for p in plots:
        by_block.setdefault(p["block_id"], []).append(p)
    by_plot: dict[str, list[dict]] = {}
    for pm in payments:
        by_plot.setdefault(pm["plot_id"], []).append(pm)
    blocks_with_plots = []
    for b in blocks:
        blocks_with_plots.append({
            **b,
            "plots": [{**plot, "payments": by_plot.get(plot["id"], [])} for plot in by_block.get(b["id"], [])],
        })
    totals = _compute_totals(blocks_with_plots, payments)
    return {"project": project, "blocks": blocks_with_plots, "totals": totals}


def _chunked(store: SqliteStore, entity: str, field: str, ids: list[str], sort: dict | None = None, with_custom: bool = False) -> list[dict]:
    out: list[dict] = []
    for i in range(0, len(ids), CHUNK):
        chunk = ids[i:i + CHUNK]
        res = store.query(QuerySpec(entity=entity, filters=[{"field": field, "op": "in", "value": chunk}], sort=sort, limit=10000, with_custom_values=with_custom))
        out.extend(res["rows"])
    return out


def _compute_totals(blocks: list[dict], payments: list[dict]) -> dict[str, Any]:
    plots = [p for b in blocks for p in b["plots"]]
    value = sum(_num(p.get("value")) for p in plots)
    paid = sum(_num(p.get("paid_amount")) for p in plots)
    sales_value = sum(_num(p.get("value")) for p in plots if (p.get("status") in ("sold", "مباع", "محجوز", "reserved")))
    return {
        "total_plots": len(plots),
        "sold_plots": sum(1 for p in plots if p.get("status") in ("sold", "مباع")),
        "reserved_plots": sum(1 for p in plots if p.get("status") in ("reserved", "محجوز")),
        "available_plots": sum(1 for p in plots if p.get("status") in ("available", "متاح")),
        "total_value": value,
        "sales_value": sales_value,
        "total_paid": paid,
        "remaining": value - paid,
        "payments_count": len(payments),
    }


async def project_financials(store: SqliteStore, project_ref: str) -> dict[str, Any]:
    tree = await project_tree(store, project_ref)
    return {"project": tree["project"], "totals": tree["totals"]}


async def installment_schedule(store: SqliteStore, plot_ref: str) -> dict[str, Any]:
    plot = store.get("plots", plot_ref)
    if not plot:
        raise ValueError(f"القطعة غير موجودة: {plot_ref}")
    payments = store.query(QuerySpec(entity="plot_payments", filters=[{"field": "plot_id", "op": "eq", "value": plot_ref}], sort={"field": "pay_date", "dir": "asc"}, limit=10000))["rows"]
    paid = sum(_num(p.get("amount")) for p in payments)
    value = _num(plot.get("value"))
    remaining = value - paid
    return {
        "plot": plot,
        "schedule": payments,
        "summary": {"value": value, "paid": paid, "remaining": remaining, "installments_count": len(payments)},
    }


async def buyer_summary(store: SqliteStore, client_ref: str) -> dict[str, Any]:
    client = store.get("clients", client_ref)
    if not client:
        raise ValueError(f"العميل غير موجود: {client_ref}")
    plots = store.query(QuerySpec(entity="plots", filters=[{"field": "client_id", "op": "eq", "value": client_ref}], limit=5000))["rows"]
    payments = _chunked(store, "plot_payments", "plot_id", [p["id"] for p in plots], sort={"field": "pay_date", "dir": "asc"})
    total_value = sum(_num(p.get("value")) for p in plots)
    total_paid = sum(_num(pm.get("amount")) for pm in payments)
    return {
        "client": client,
        "plots": plots,
        "summary": {"owned_plots": len(plots), "total_value": total_value, "total_paid": total_paid, "remaining": total_value - total_paid},
    }


async def payment_ledger(store: SqliteStore, entity_type: str, entity_ref: str) -> dict[str, Any]:
    if entity_type == "plot":
        payments = store.query(QuerySpec(entity="plot_payments", filters=[{"field": "plot_id", "op": "eq", "value": entity_ref}], sort={"field": "pay_date", "dir": "asc"}, limit=10000))["rows"]
    elif entity_type == "client":
        plots = store.query(QuerySpec(entity="plots", filters=[{"field": "client_id", "op": "eq", "value": entity_ref}], limit=5000))["rows"]
        payments = _chunked(store, "plot_payments", "plot_id", [p["id"] for p in plots], sort={"field": "pay_date", "dir": "asc"})
    else:
        raise ValueError("نوع الكيان غير مدعوم في دفتر المدفوعات")
    total = sum(_num(p.get("amount")) for p in payments)
    return {"entity_type": entity_type, "entity_ref": entity_ref, "ledger": payments, "total": total, "count": len(payments)}


async def dashboard_kpis(store: SqliteStore) -> dict[str, Any]:
    props = store.query(QuerySpec(entity="properties", limit=1))["total"]
    clients = store.query(QuerySpec(entity="clients", limit=1))["total"]
    offers = store.query(QuerySpec(entity="offers", limit=1))["total"]
    projects = store.query(QuerySpec(entity="projects", limit=1))["total"]
    blocks = store.query(QuerySpec(entity="blocks", limit=1))["total"]
    plots = store.query(QuerySpec(entity="plots", limit=1))["total"]
    payments = store.query(QuerySpec(entity="plot_payments", limit=1))["total"]
    total_paid = sum(_num(p.get("amount")) for p in store.query(QuerySpec(entity="plot_payments", limit=10000))["rows"])
    return {
        "properties": props, "clients": clients, "offers": offers,
        "projects": projects, "blocks": blocks, "plots": plots,
        "payments": payments, "total_collected": total_paid,
    }
