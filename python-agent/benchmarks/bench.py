"""Performance & robustness benchmark for the new Kimo Python engine.

Compares the new engine against an *old-engine-equivalent* baseline that mimics
the original TypeScript runtime's known bottlenecks:

1. **Sequential tool dispatch** — the old engine ran ``for (const call of
   result.toolCalls) await handleToolCall(...)`` (see
   ``reference/original-app/src/assistant/executor.ts:369``); the new engine
   dispatches concurrent calls with ``asyncio.gather`` (``kimo/loop.py:280``).
2. **N+1 analytics** — naive per-block/per-plot awaited fetches vs the new
   chunked ``IN`` queries (``kimo/integration/analytics.py``).
3. **Per-call validation latency** under load.
4. **Concurrent session scaling** (async engine).
5. **HTTP transport** — ``httpx`` pooled vs stdlib ``urllib``.

Run:  ``PYTHONPATH=. python3 -m benchmarks.bench``
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Awaitable, Callable

from kimo.integration.analytics import project_tree
from kimo.integration.backend import build_integration_registry
from kimo.integration.store import SqliteStore
from kimo.tools import Registry, ToolArg, ToolCall, parse_tool_args

from benchmarks.datasets import seed_realistic


def _t() -> float:
    return time.perf_counter()


def _measure(fn: Callable[[], Awaitable[None]], repeats: int = 5) -> float:
    best = float("inf")
    for _ in range(repeats):
        start = _t()
        asyncio.run(fn()) if not asyncio.iscoroutinefunction(fn) else None
    # run properly below
    return best


async def _timeit(coro_fn: Callable[[], Awaitable[None]], repeats: int = 5) -> float:
    best = float("inf")
    for _ in range(repeats):
        start = _t()
        await coro_fn()
        best = min(best, _t() - start)
    return best


# ---------------------------------------------------------------------------
# 1) Parallel vs sequential tool dispatch (with realistic I/O latency)
# ---------------------------------------------------------------------------

LATENCY = 0.015  # 15ms per tool — emulates DB/network round-trip


async def _laggy_handler(args, ctx):
    await asyncio.sleep(LATENCY)
    return {"ok": True, "data": args}


def _build_laggy_registry(n: int) -> Registry:
    reg = Registry()
    for i in range(n):
        reg.register_handler(f"op_{i}", "laggy", [ToolArg("x", "string", required=True)], _laggy_handler)
    return reg


async def _dispatch_parallel(reg: Registry, n: int) -> None:
    calls = [ToolCall(id=f"c{i}", name=f"op_{i}", arguments='{"x":"1"}') for i in range(n)]
    await asyncio.gather(*[reg.execute(c, ctx=None) for c in calls])


async def _dispatch_sequential(reg: Registry, n: int) -> None:
    for i in range(n):
        await reg.execute(ToolCall(id=f"c{i}", name=f"op_{i}", arguments='{"x":"1"}'), ctx=None)


# ---------------------------------------------------------------------------
# 2) Analytics: chunked IN-queries vs naive N+1
# ---------------------------------------------------------------------------


async def _analytics_chunked(store: SqliteStore, pid: str) -> None:
    await project_tree(store, pid)


async def _analytics_naive(store: SqliteStore, pid: str) -> None:
    """Mimics an unbatched old-style fetch: one query per block, then per plot."""
    blocks = store.query(__import__("kimo.integration.store", fromlist=["QuerySpec"]).QuerySpec(entity="blocks", filters=[{"field": "project_id", "op": "eq", "value": pid}], limit=2000))["rows"]
    total = 0
    for b in blocks:
        plots = store.query(__import__("kimo.integration.store", fromlist=["QuerySpec"]).QuerySpec(entity="plots", filters=[{"field": "block_id", "op": "eq", "value": b["id"]}], limit=10000))["rows"]
        for p in plots:
            total += len(store.query(__import__("kimo.integration.store", fromlist=["QuerySpec"]).QuerySpec(entity="plot_payments", filters=[{"field": "plot_id", "op": "eq", "value": p["id"]}], limit=10000))["rows"])
    return total


# ---------------------------------------------------------------------------
# 3) Validation guard throughput
# ---------------------------------------------------------------------------


def _validation_throughput(reg: Registry, n: int) -> float:
    calls = [ToolCall(id=f"v{i}", name="op_0", arguments='{"x":"1"}') for i in range(n)]
    start = _t()
    for c in calls:
        reg.validate(c)
    return _t() - start


# ---------------------------------------------------------------------------
# 4) Concurrent sessions
# ---------------------------------------------------------------------------


async def _concurrent_sessions(reg: Registry, sessions: int) -> None:
    async def one():
        calls = [ToolCall(id="s", name="op_0", arguments='{"x":"1"}') for _ in range(4)]
        await asyncio.gather(*[reg.execute(c, ctx=None) for c in calls])
    await asyncio.gather(*[one() for _ in range(sessions)])


async def _sequential_sessions(reg: Registry, sessions: int) -> None:
    for _ in range(sessions):
        for _ in range(4):
            await reg.execute(ToolCall(id="s", name="op_0", arguments='{"x":"1"}'), ctx=None)


# ---------------------------------------------------------------------------
# 5) HTTP transport (if httpx available)
# ---------------------------------------------------------------------------


async def _http_transport() -> dict:
    out: dict = {}
    try:
        from kimo.llm import HttpxTransport, UrllibTransport
    except Exception:
        return out
    n = 40
    url = "https://httpbin.org/get"
    try:
        t0 = _t()
        tr = UrllibTransport()
        for _ in range(n):
            asyncio.run(tr.request("GET", url, {}, b"", 5))
        out["urllib_seq_s"] = _t() - t0
    except Exception:
        out["urllib_seq_s"] = None
    try:
        import httpx
        t0 = _t()
        async with httpx.AsyncClient() as client:
            tr = HttpxTransport(client)
            async def _go():
                for _ in range(n):
                    await tr.request("GET", url, {}, b"", 5)
            await _go()
        out["httpx_pooled_s"] = _t() - t0
    except Exception:
        out["httpx_pooled_s"] = None
    return out


# ---------------------------------------------------------------------------


def _fmt(sec: float) -> str:
    if sec is None:
        return "n/a"
    if sec < 1:
        return f"{sec*1000:.1f} ms"
    return f"{sec:.2f} s"


async def main() -> int:
    print("=" * 72)
    print("معيار أداء وقوة محرك كيمو (البايثوني) مقابل نظير المحرك القديم")
    print("=" * 72)

    store = SqliteStore(":memory:", seed=False)
    counts = seed_realistic(store, projects=3, blocks_per_project=6, plots_per_block=80, payments... )  # placeholder
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(asyncio.run(main()))
