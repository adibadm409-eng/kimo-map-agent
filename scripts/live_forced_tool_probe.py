import json
import os
from datetime import datetime, timezone
from typing import Any

import requests

TOOL = {
    "type": "function",
    "function": {
        "name": "current_local_time",
        "description": "Return a fixed local time for a safe read-only integration test.",
        "parameters": {
            "type": "object",
            "properties": {"timezone": {"type": "string"}},
            "required": ["timezone"],
            "additionalProperties": False,
        },
    },
}

def redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: redact(v) for k, v in value.items() if k.lower() not in {"api_key", "authorization", "key", "token"}}
    if isinstance(value, list):
        return [redact(v) for v in value]
    return value


def call(base: str, key: str, payload: dict, stream: bool = False):
    response = requests.post(
        f"{base}/chat/completions",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json=payload,
        timeout=45,
        stream=stream,
    )
    if stream:
        lines = []
        for line in response.iter_lines(decode_unicode=True):
            if line and line.startswith("data:"):
                lines.append(line[:500])
                if len(lines) >= 4:
                    break
        return response, {"firstEvents": lines}
    try:
        body = response.json()
    except Exception:
        body = response.text[:1000]
    return response, redact(body)


def one(provider: str, model: str, key: str) -> dict:
    base = "https://generativelanguage.googleapis.com/v1beta/openai" if provider == "gemini" else "https://api.mistral.ai/v1"
    base_messages = [
        {"role": "system", "content": "You are a deterministic integration test. Use the requested function exactly once."},
        {"role": "user", "content": "Call current_local_time now. Do not answer with prose before the function call."},
    ]
    row = {"provider": provider, "model": model, "startedAt": datetime.now(timezone.utc).isoformat(), "initial": {}, "followup": {}, "stream": {}, "status": "PASS"}
    try:
        payload = {"model": model, "messages": base_messages, "tools": [TOOL], "tool_choice": {"type": "function", "function": {"name": "current_local_time"}}, "max_tokens": 128}
        response, body = call(base, key, payload)
        row["initial"] = {"http": response.status_code, "body": body}
        if response.status_code >= 400:
            row["status"] = "FAIL"
            return row
        message = ((body.get("choices") or [{}])[0].get("message") or {}) if isinstance(body, dict) else {}
        calls = message.get("tool_calls") or []
        row["initial"]["toolCallCount"] = len(calls)
        if not calls:
            row["status"] = "FAIL"
            row["initial"]["error"] = "Provider did not return a forced tool call"
            return row
        follow_messages = base_messages + [message]
        for tool_call in calls:
            follow_messages.append({"role": "tool", "tool_call_id": tool_call.get("id"), "name": ((tool_call.get("function") or {}).get("name") or "current_local_time"), "content": json.dumps({"ok": True, "timezone": "Asia/Riyadh", "local_time": "2026-08-17T12:00:00+03:00"})})
        follow_payload = {"model": model, "messages": follow_messages, "tools": [TOOL], "tool_choice": "auto", "max_tokens": 128}
        follow_response, follow_body = call(base, key, follow_payload)
        row["followup"] = {"http": follow_response.status_code, "body": follow_body}
        if follow_response.status_code >= 400:
            row["status"] = "FAIL"
            return row
        stream_payload = {"model": model, "messages": [{"role": "user", "content": "Reply exactly KIMO_STREAM_OK"}], "stream": True, "max_tokens": 32}
        stream_response, stream_body = call(base, key, stream_payload, stream=True)
        row["stream"] = {"http": stream_response.status_code, **stream_body}
        if stream_response.status_code >= 400 and stream_response.status_code != 429:
            row["status"] = "FAIL"
    except Exception as error:
        row["status"] = "FAIL"
        row["error"] = str(error)[:1000]
    return row


def main():
    cases = [
        ("gemini", "models/gemini-3-flash-preview", os.environ.get("KIMO_GEMINI_KEY", "")),
        ("mistral", "mistral-medium-2505", os.environ.get("KIMO_MISTRAL_KEY", "")),
        ("mistral", "mistral-medium-2508", os.environ.get("KIMO_MISTRAL_KEY", "")),
        ("mistral", "devstral-2512", os.environ.get("KIMO_MISTRAL_KEY", "")),
    ]
    results = [one(provider, model, key) for provider, model, key in cases]
    output = {"generatedAt": datetime.now(timezone.utc).isoformat(), "results": results, "secretsStored": False}
    path = "/home/ubuntu/property-manager-app/docs/LIVE_FORCED_TOOL_PROBE_AR.json"
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(output, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(json.dumps({"path": path, "results": [{"provider": r["provider"], "model": r["model"], "status": r["status"], "initialHttp": r["initial"].get("http"), "followupHttp": r["followup"].get("http"), "streamHttp": r["stream"].get("http")} for r in results]}, ensure_ascii=False))
    raise SystemExit(1 if any(r["status"] == "FAIL" for r in results) else 0)


if __name__ == "__main__":
    main()
