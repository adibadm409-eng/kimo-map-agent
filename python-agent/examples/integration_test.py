"""Integration smoke test for the real domain backend.

Runs without any LLM: it exercises the tool layer (query / get / mutate_record
/ list / project analytics) directly through the engine's Registry, against a
seeded in-memory SQLite store.
"""

import asyncio
import sys

from kimo.integration.backend import build_integration_registry
from kimo.integration.store import SqliteStore
from kimo.tools import ToolCall
from kimo.types import parse_tool_args


def seed(store: SqliteStore) -> str:
    proj = store.create("projects", {"name": "روضة الورود", "location": "شمال المدينة"})
    pid = proj["id"]
    b = store.create("blocks", {"project_id": pid, "name": "البلوك A"})
    bid = b["id"]
    p1 = store.create("plots", {"project_id": pid, "block_id": bid, "plot_no": "1", "status": "sold", "value": 100000, "paid_amount": 60000, "client_id": "c1"})
    p1id = p1["id"]
    store.create("plot_payments", {"plot_id": p1id, "amount": 60000, "pay_date": "2025-01-01", "method": "تحويل"})
    store.create("clients", {"id": "c1", "name": "أحمد", "phone": "050"})
    return pid


async def call(reg, name, args):
    return await reg.execute(ToolCall(id="c", name=name, arguments=args), ctx=None)


async def main() -> int:
    store = SqliteStore(":memory:", seed=True)
    pid = seed(store)
    reg = build_integration_registry(store)

    # 1) create + read round-trip
    res = await call(reg, "mutate_record", '{"entity":"clients","action":"create","data":{"name":"سارة","phone":"055"}}')
    assert res.ok, res.observation
    cid = res.data["id"]

    res = await call(reg, "get", f'{{"entity":"clients","id":"{cid}"}}')
    assert res.ok and res.data["name"] == "سارة", res.observation

    # 2) query with filter + computed totals
    res = await call(reg, "query", '{"entity":"clients","filters":[{"field":"name","op":"eq","value":"سارة"}]}')
    assert res.ok and res.data["total"] == 1, res.observation

    # 3) project tree + financials
    res = await call(reg, "project_tree", f'{{"project_ref":"{pid}"}}')
    assert res.ok, res.observation
    assert res.data["totals"]["total_value"] == 100000, res.observation
    assert res.data["totals"]["sold_plots"] == 1, res.observation

    res = await call(reg, "project_financials", f'{{"project_ref":"{pid}"}}')
    assert res.ok and res.data["totals"]["remaining"] == 40000, res.observation

    # 4) installment schedule
    plot_id = store.query(__import__("kimo.integration.store", fromlist=["QuerySpec"]).QuerySpec(entity="plots", limit=10))["rows"][0]["id"]
    res = await call(reg, "installment_schedule", f'{{"plot_ref":"{plot_id}"}}')
    assert res.ok and res.data["summary"]["paid"] == 60000, res.observation

    # 5) buyer summary
    res = await call(reg, "buyer_summary", '{"client_ref":"c1"}')
    assert res.ok and res.data["summary"]["owned_plots"] == 1, res.observation

    # 6) payment ledger
    res = await call(reg, "payment_ledger", '{"entity_type":"client","entity_ref":"c1"}')
    assert res.ok and res.data["total"] == 60000, res.observation

    # 7) dashboard kpis
    res = await call(reg, "dashboard_kpis", "{}")
    assert res.ok and res.data["projects"] == 1, res.observation

    # 8) validation guard: unknown entity is rejected before execution
    res = await call(reg, "get", '{"entity":"nope","id":"x"}')
    assert not res.ok, "should reject unknown entity"

    # 9) record_payment records + recomputes paid_amount atomically
    res = await call(reg, "record_payment", f'{{"plot_ref":"{plot_id}","amount":25000}}')
    assert res.ok and res.data["paid_amount"] == 25000 + 60000, res.observation
    assert res.data["remaining"] == 15000, res.observation

    # 10) project_integrity_check passes on a coherent project
    res = await call(reg, "project_integrity_check", f'{{"project_ref":"{pid}"}}')
    assert res.ok and res.data["ok"] is True, res.observation

    # 11) skill catalog parity (12 skills, routing works)
    from kimo.skills import SKILLS, assess_skill
    assert len(SKILLS) == 12, f"expected 12 skills, got {len(SKILLS)}"
    routed = assess_skill("سجّل دفعة على القطعة").skill.id
    assert routed in SKILLS, routed

    print("INTEGRATION_OK: all 11 checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
