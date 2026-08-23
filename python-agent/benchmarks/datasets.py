"""Benchmark datasets — seed a realistic Property Manager DB for the
performance harness. Kept separate from the production code path.
"""

from __future__ import annotations

from kimo.integration.store import SqliteStore


def seed_realistic(store: SqliteStore, *, projects: int = 3, blocks_per_project: int = 6, plots_per_block: int = 100, payments_per_plot: int = 2) -> dict:
    counts = {"projects": 0, "blocks": 0, "plots": 0, "plot_payments": 0, "clients": 0}
    for p in range(projects):
        proj = store.create("projects", {"name": f"مشروع {p}", "location": "مدينة"})
        counts["projects"] += 1
        for b in range(blocks_per_project):
            blk = store.create("blocks", {"project_id": proj["id"], "name": f"بلوك {b}"})
            counts["blocks"] += 1
            for pl in range(plots_per_block):
                value = 100000 + (pl * 1000) % 50000
                plot = store.create("plots", {"project_id": proj["id"], "block_id": blk["id"], "plot_no": str(pl), "status": "available", "value": value, "paid_amount": 0})
                counts["plots"] += 1
                for _ in range(payments_per_plot):
                    store.create("plot_payments", {"plot_id": plot["id"], "amount": 5000, "pay_date": "2025-01-01", "method": "تحويل"})
                    counts["plot_payments"] += 1
    for c in range(50):
        store.create("clients", {"name": f"عميل {c}", "phone": f"05{c}"})
        counts["clients"] += 1
    return counts
