"""Performance & robustness benchmark for the new Kimo Python engine.

Compares the new engine against an *old-engine-equivalent* baseline that mimics
the original TypeScript runtime's known bottlenecks:

1. **Sequential tool dispatch** — the old engine ran ``for (const call of
   result.toolCalls) await handleToolCall(...)``
   (``reference/original-app/src/assistant/executor.ts:369``); the new engine
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
from typing import Awaitable, Callable

from kimo.integration.analytics import project_tree
from kimo.integration.store import QuerySpec, SqliteStore
from kimo.tools import Registry, ToolArg, ToolCall

from benchmarks.datasets import seed_realistic


def _t() -> float:
    return time.perf_counter()


async def _timeit(coro_fn: Callable[[], Awaitable[None]], repeats: int = 5) -> float:
    best = float("inf")
    for _ in range(repeats):
        start = _t()
        await coro_fn()
        best = min(best, _t() - start)
    return best


# --- 1) parallel vs sequential tool dispatch (realistic I/O latency) --------

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


# --- 2) analytics: chunked IN-queries vs naive N+1 ---------------------------------


async def _analytics_chunked(store: SqliteStore, pid: str) -> None:
    await project_tree(store, pid)


async def _analytics_naive(store: SqliteStore, pid: str) -> None:
    blocks = store.query(QuerySpec(entity="blocks", filters=[{"field": "project_id", "op": "eq", "value": pid}], limit=2000))["rows"]
    total = 0
    for b in blocks:
        plots = store.query(QuerySpec(entity="plots", filters=[{"field": "block_id", "op": "eq", "value": b["id"]}], limit=10000))["rows"]
        for p in plots:
            total += len(store.query(QuerySpec(entity="plot_payments", filters=[{"field": "plot_id", "op": "eq", "value": p["id"]}], limit=10000))["rows"])
    return total


# --- 3) validation guard throughput ---------------------------------------------


def _validation_throughput(reg: Registry, n: int) -> float:
    calls = [ToolCall(id=f"v{i}", name="op_0", arguments='{"x":"1"}') for i in range(n)]
    start = _t()
    for c in calls:
        reg.validate(c)
    return _t() - start


# --- 4) concurrent sessions -----------------------------------------------------


async def _concurrent_sessions(reg: Registry, sessions: int) -> None:
    async def one() -> None:
        calls = [ToolCall(id="s", name="op_0", arguments='{"x":"1"}') for _ in range(4)]
        await asyncio.gather(*[reg.execute(c, ctx=None) for c in calls])
    await asyncio.gather(*[one() for _ in range(sessions)])


async def _sequential_sessions(reg: Registry, sessions: int) -> None:
    for _ in range(sessions):
        for _ in range(4):
            await reg.execute(ToolCall(id="s", name="op_0", arguments='{"x":"1"}'), ctx=None)


# --- 5) HTTP transport (if httpx available) --------------------------------------


async def _http_transport() -> dict:
    out: dict = {}
    n = 30
    url = "https://httpbin.org/get"
    try:
        from kimo.llm import HttpxTransport, UrllibTransport
    except Exception:
        return out
    try:
        tr = UrllibTransport()
        t0 = _t()
        for _ in range(n):
            await tr.request("GET", url, {}, b"", 5)
        out["urllib_seq_s"] = _t() - t0
    except Exception:
        out["urllib_seq_s"] = None
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            tr = HttpxTransport(client)
            t0 = _t()
            for _ in range(n):
                await tr.request("GET", url, {}, b"", 5)
            out["httpx_pooled_s"] = _t() - t0
    except Exception:
        out["httpx_pooled_s"] = None
    return out


def _fmt(sec) -> str:
    if sec is None:
        return "n/a"
    return f"{sec*1000:.1f} ms" if sec < 1 else f"{sec:.2f} s"


async def main() -> int:
    print("=" * 74)
    print("معيار أداء وقوة محرك كيمو (البايثوني) مقابل نظير المحرك القديم")
    print("=" * 74)

    store = SqliteStore(":memory:", seed=False)
    store.bootstrap()
    counts = seed_realistic(store, projects=3, blocks_per_project=6, plots_per_block=80, payments_per_plot=2)
    pid = store.query(QuerySpec(entity="projects", limit=1))["rows"][0]["id"]
    print(f"مجموعة البيانات: {counts['projects']} مشاريع، {counts['blocks']} بلوك، "
          f"{counts['plots']} قطعة، {counts['plot_payments']} دفعة، {counts['clients']} عميل.\n")

    N_TOOLS = 12
    laggy = _build_laggy_registry(N_TOOLS)

    par = await _timeit(lambda: _dispatch_parallel(laggy, N_TOOLS))
    seq = await _timeit(lambda: _dispatch_sequential(laggy, N_TOOLS))
    speedup_dispatch = seq / par if par else float("inf")

    ana_new = await _timeit(lambda: _analytics_chunked(store, pid))
    ana_old = await _timeit(lambda: _analytics_naive(store, pid))
    speedup_ana = ana_old / ana_new if ana_new else float("inf")

    N_VAL = 20000
    val_sec = _validation_throughput(laggy, N_VAL)
    val_us = (val_sec / N_VAL) * 1_000_000

    SESS = 25
    conc = await _timeit(lambda: _concurrent_sessions(laggy, SESS), repeats=3)
    seqs = await _timeit(lambda: _sequential_sessions(laggy, SESS), repeats=3)
    speedup_sess = seqs / conc if conc else float("inf")

    print(f"[1] تنفيذ {N_TOOLS} أداة موازية:")
    print(f"     المحرك الجديد (asyncio.gather) : {_fmt(par)}")
    print(f"     نظير القديم (تسلسلي for-loop)  : {_fmt(seq)}")
    print(f"     >> تسريع: x{speedup_dispatch:.1f}\n")

    print(f"[2] بناء شجرة مشروع (تحليلات):")
    print(f"     المحرك الجديد (استعلامات IN مجمّعة): {_fmt(ana_new)}")
    print(f"     نظير القديم (N+1 لكل بلوك/قطعة)    : {_fmt(ana_old)}")
    print(f"     >> تسريع: x{speedup_ana:.1f}\n")

    print(f"[3] حارس التحقق قبل التنفيذ ({N_VAL:,} نداء):")
    print(f"     زمن إجمالي {_fmt(val_sec)}  =>  {val_us:.1f} مايكروثانية/نداء\n")

    print(f"[4] توسّع الجلسات المتزامنة ({SESS} جلسة × 4 أدوات):")
    print(f"     المحرك الجديد (async متزامن): {_fmt(conc)}")
    print(f"     نظير القديم (تسلسلي)         : {_fmt(seqs)}")
    print(f"     >> تسريع: x{speedup_sess:.1f}\n")

    http = await _http_transport()
    if http.get("urllib_seq_s") is not None or http.get("httpx_pooled_s") is not None:
        print("[5] نقل HTTP (طلبات متكررة):")
        if http.get("urllib_seq_s") is not None:
            print(f"     urllib (صفري الاعتمادية، متسلسل): {_fmt(http['urllib_seq_s'])}")
        if http.get("httpx_pooled_s") is not None:
            print(f"     httpx (تجميع اتصالات)          : {_fmt(http['httpx_pooled_s'])}")
        print()

    print("-" * 74)
    print("الخلاصة: المحرك الجديد يتفوق على القديم في زمن تنفيذ الأدوات المتعددة")
    print(f"(x{speedup_dispatch:.1f})، وتحليلات المجال (x{speedup_ana:.1f})، وتوسّع الجلسات")
    print(f"(x{speedup_sess:.1f})، مع حارس تحقق بدقة مايكروثانية وحراس متانة إضافية")
    print("(إصلاح وسائط تالفة، قصّ السجل، نقل قابل للتوصيل).")
    print("=" * 74)
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(asyncio.run(main()))
