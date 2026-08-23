"""LLM wiring: provider chat client + retry/backoff (mirrors ``assistant/llm.ts``).

The client speaks the OpenAI chat-completions wire format with tool calling,
which is also what Gemini/DeepSeek/Mistral/OpenAI-compatible endpoints accept.
Anthropic is normalised to the same shape by the ``anthropic`` adapter.

Network calls use the standard library only (``urllib``) so the package has
**zero hard dependencies** and runs anywhere Python 3.9+ runs. For higher
throughput, swap :class:`HttpChatClient` for an ``httpx``-backed one — the
interface is identical.
"""

from __future__ import annotations

import asyncio
import json
import time
import urllib.request
import urllib.error
from dataclasses import dataclass
from typing import Any, Callable, Optional

from .config import ProviderDef
from .types import ChatMessage, ChatResult, FunctionDef, ToolCall, parse_tool_args

DEFAULT_RETRY_DELAYS = (3, 5, 10, 30)


class LlmError(Exception):
    def __init__(self, message: str, kind: str = "unknown", status: Optional[int] = None):
        super().__init__(message)
        self.message = message
        self.kind = kind
        self.status = status


def _classify_error(status: int, body: str) -> str:
    if status == 401 or status == 403:
        return "auth"
    if status == 400 or status == 422:
        return "invalid_request"
    if status == 404:
        return "not_found"
    if status == 429:
        return "rate_limit"
    if status >= 500:
        return "server"
    if "timeout" in body.lower():
        return "timeout"
    return "unknown"


class ChatClient:
    """Minimal async chat client speaking the OpenAI tool-calling protocol."""

    def __init__(self, timeout: float = 120.0):
        self.timeout = timeout

    async def chat(
        self,
        provider: ProviderDef,
        *,  # noqa: D401
        base_url: str,
        api_key: str,
        model: str,
        messages: list[ChatMessage],
        functions: list[FunctionDef],
        max_tokens: int = 4000,
        temperature: float = 0.2,
        on_delta: Optional[Callable[[ChatResult], None]] = None,
        signal: Any = None,
    ) -> ChatResult:
        payload = self._build_payload(provider, model, messages, functions, max_tokens, temperature)
        headers = self._headers(provider, api_key)
        url = self._endpoint(provider, base_url)

        def _request() -> dict[str, Any]:
            data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(url, data=data, headers=headers, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except urllib.error.HTTPError as e:  # pragma: no cover - network
                body = e.read().decode("utf-8", "replace")
                raise LlmError(
                    f"{e.code} {e.reason}: {body[:500]}",
                    kind=_classify_error(e.code, body),
                    status=e.code,
                )
            except urllib.error.URLError as e:  # pragma: no cover - network
                raise LlmError(f"network error: {e.reason}", kind="network")

        raw = await asyncio.to_thread(_request)
        return self._parse_response(raw, on_delta)

    # --- wire formatting -----------------------------------------------------

    def _endpoint(self, provider: ProviderDef, base_url: str) -> str:
        base = (base_url or provider.base_url).rstrip("/")
        if provider.wire_family.value == "anthropic":
            return f"{base}/messages"
        return f"{base}/chat/completions"

    def _headers(self, provider: ProviderDef, api_key: str) -> dict[str, str]:
        if provider.wire_family.value == "anthropic":
            return {
                "x-api-key": api_key or "",
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            }
        return {
            "authorization": f"Bearer {api_key or ''}",
            "content-type": "application/json",
        }

    def _messages_to_wire(self, messages: list[ChatMessage]) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for m in messages:
            if m.role == "system":
                out.append({"role": "system", "content": m.text})
            elif m.role == "user":
                out.append({"role": "user", "content": m.text})
            elif m.role == "assistant":
                item: dict[str, Any] = {"role": "assistant", "content": m.text or None}
                if m.tool_calls:
                    item["tool_calls"] = [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {"name": tc.name, "arguments": tc.arguments},
                        }
                        for tc in m.tool_calls
                    ]
                out.append(item)
            elif m.role == "tool":
                out.append(
                    {
                        "role": "tool",
                        "tool_call_id": m.tool_call_id,
                        "name": m.name or "",
                        "content": m.text,
                    }
                )
        return out

    def _build_payload(
        self,
        provider: ProviderDef,
        model: str,
        messages: list[ChatMessage],
        functions: list[FunctionDef],
        max_tokens: int,
        temperature: float,
    ) -> dict[str, Any]:
        wire_messages = self._messages_to_wire(messages)
        if functions:
            tools = [f.to_wire() for f in functions]
            if provider.wire_family.value == "anthropic":
                return {
                    "model": model,
                    "max_tokens": max_tokens,
                    "system": self._extract_system(messages),
                    "messages": [m for m in wire_messages if m["role"] != "system"],
                    "tools": tools,
                    "temperature": temperature,
                }
            return {
                "model": model,
                "messages": wire_messages,
                "tools": tools,
                "tool_choice": "auto",
                "max_tokens": max_tokens,
                "temperature": temperature,
            }
        if provider.wire_family.value == "anthropic":
            return {
                "model": model,
                "max_tokens": max_tokens,
                "system": self._extract_system(messages),
                "messages": [m for m in wire_messages if m["role"] != "system"],
                "temperature": temperature,
            }
        return {
            "model": model,
            "messages": wire_messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }

    @staticmethod
    def _extract_system(messages: list[ChatMessage]) -> str:
        return "\n\n".join(m.text for m in messages if m.role == "system" and m.text)

    def _parse_response(
        self, raw: dict[str, Any], on_delta: Optional[Callable[[ChatResult], None]] = None
    ) -> ChatResult:
        # Normalize Anthropic → OpenAI shape.
        if "content" in raw and isinstance(raw.get("content"), list) and "choices" not in raw:
            text_parts = []
            tool_calls = []
            for block in raw["content"]:
                t = block.get("type")
                if t == "text":
                    text_parts.append(block.get("text", ""))
                elif t == "tool_use":
                    tool_calls.append(
                        ToolCall(
                            id=block.get("id", f"call_{len(tool_calls)}"),
                            name=block.get("name", ""),
                            arguments=json.dumps(block.get("input", {}), ensure_ascii=False),
                        )
                    )
            return ChatResult(content="".join(text_parts) or None, tool_calls=tool_calls, raw=raw)

        choice = raw["choices"][0]
        message = choice.get("message", {})
        text = message.get("content")
        tool_calls = []
        for tc in message.get("tool_calls", []) or []:
            fn = tc.get("function", {})
            tool_calls.append(
                ToolCall(
                    id=tc.get("id", f"call_{len(tool_calls)}"),
                    name=fn.get("name", ""),
                    arguments=fn.get("arguments", "{}"),
                )
            )
        if on_delta:
            on_delta(ChatResult(content=text, tool_calls=tool_calls, raw=raw))
        return ChatResult(content=text, tool_calls=tool_calls, raw=raw)


async def chat_with_retry(
    client: ChatClient,
    provider: ProviderDef,
    *,
    base_url: str,
    api_key: str,
    model: str,
    messages: list[ChatMessage],
    functions: list[FunctionDef],
    max_tokens: int = 4000,
    on_delta: Optional[Callable[[ChatResult], None]] = None,
    signal: Any = None,
    retry_delays: tuple[int, ...] = DEFAULT_RETRY_DELAYS,
) -> ChatResult:
    """Call the model with exponential backoff over transient failures.

    Mirrors ``chatWithRetry``: retries network/timeout/rate-limit/server errors
    with the given delays, then raises :class:`LlmError`. Auth and
    invalid-request errors are raised immediately (no point retrying).
    """
    last_err: Optional[LlmError] = None
    for attempt, delay in enumerate(retry_delays):
        try:
            return await client.chat(
                provider,
                base_url=base_url,
                api_key=api_key,
                model=model,
                messages=messages,
                functions=functions,
                max_tokens=max_tokens,
                on_delta=on_delta,
                signal=signal,
            )
        except LlmError as e:
            last_err = e
            transient = e.kind in ("network", "timeout", "rate_limit", "server")
            if not transient or attempt >= len(retry_delays) - 1:
                raise
            if signal is not None and getattr(signal, "cancelled", False):
                raise
            await asyncio.sleep(delay)
    # Should be unreachable; satisfy type checkers.
    raise last_err or LlmError("unknown chat failure")
