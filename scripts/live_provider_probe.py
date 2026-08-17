import concurrent.futures
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from typing import Any

import requests

TIMEOUT = 35
TOOLS = [
    {
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
]
BASE_MESSAGES = [
    {"role": "system", "content": "You are Kimo integration test. Do not claim external actions. Be concise."},
    {"role": "user", "content": "Call current_local_time with timezone Asia/Riyadh, then summarize the returned result."},
]


def redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: redact(v) for k, v in value.items() if k.lower() not in {"api_key", "authorization", "key", "token"}}
    if isinstance(value, list):
        return [redact(v) for v in value]
    return value


def request_json(url: str, key: str, payload: dict | None = None, stream: bool = False):
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    if payload is None:
        response = requests.get(url, headers={"Authorization": f"Bearer {key}"}, timeout=TIMEOUT)
    else:
        response = requests.post(url, headers=headers, json=payload, timeout=TIMEOUT, stream=stream)
    return response


def list_models(provider: str, key: str) -> list[dict]:
    url = (
        "https://generativelanguage.googleapis.com/v1beta/openai/models"
        if provider == "gemini"
        else "https://api.mistral.ai/v1/models"
    )
    response = request_json(url, key)
    if response.status_code >= 400:
        raise RuntimeError(f"models HTTP {response.status_code}: {response.text[:300]}")
    body = response.json()
    rows = body.get("data", body.get("models", []))
    return [row for row in rows if isinstance(row, dict) and row.get("id")]


def is_modern(provider: str, model_id: str) -> bool:
    name = model_id.lower()
    if any(x in name for x in ("embedding", "embed", "moderation", "image", "tts", "transcrib", "ocr")):
        return False
    if provider == "gemini":
        return bool(re.search(r"gemini-(2\.5|3)", name)) and "live" not in name
    return bool(re.search(r"(?:mistral-(?:large|medium|small)|magistral|ministral|devstral|voxtral)", name))


def choose_models(provider: str, rows: list[dict]) -> list[str]:
    candidates = [row["id"] for row in rows if is_modern(provider, row["id"])]
    # Prefer one model from each current family, then cap the probe to keep it safe and bounded.
    priorities = (
        ("gemini-3", "gemini-2.5", "gemini-2")
        if provider == "gemini"
        else ("mistral-large", "mistral-medium", "magistral", "mistral-small", "ministral", "devstral")
    )
    ordered = []
    for prefix in priorities:
        ordered.extend([model for model in candidates if prefix in model.lower() and model not in ordered])
    ordered.extend([model for model in candidates if model not in ordered])
    return ordered[:3]


def parse_stream(response: requests.Response) -> dict:
    text_chunks = []
    tool_chunks: dict[int, dict] = {}
    raw_events = 0
    for raw in response.iter_lines(decode_unicode=True):
        if not raw or not raw.startswith("data:"):
            continue
        data = raw[5:].strip()
        if data == "[DONE]":
            continue
        raw_events += 1
        try:
            chunk = json.loads(data)
        except json.JSONDecodeError:
            continue
        for choice in chunk.get("choices", []):
            delta = choice.get("delta") or {}
            if isinstance(delta.get("content"), str):
                text_chunks.append(delta["content"])
            for call in delta.get("tool_calls") or []:
                index = int(call.get("index", 0))
                slot = tool_chunks.setdefault(index, {"index": index, "id": "", "type": "function", "function": {"name": "", "arguments": ""}})
                slot["id"] += str(call.get("id") or "")
                fn = call.get("function") or {}
                slot["function"]["name"] += str(fn.get("name") or "")
                slot["function"]["arguments"] += str(fn.get("arguments") or "")
    return {"content": "".join(text_chunks), "tool_calls": list(tool_chunks.values()), "events": raw_events}


def run_model(provider: str, key: str, model: str) -> dict:
    base = "https://generativelanguage.googleapis.com/v1beta/openai" if provider == "gemini" else "https://api.mistral.ai/v1"
    result = {"provider": provider, "model": model, "text": {}, "tools": {}, "stream": {}, "status": "PASS", "startedAt": datetime.now(timezone.utc).isoformat()}
    try:
        text_payload = {"model": model, "messages": [{"role": "user", "content": "Reply with exactly: KIMO_TEXT_OK"}], "max_tokens": 32}
        text_response = request_json(f"{base}/chat/completions", key, text_payload)
        result["text"] = {"http": text_response.status_code, "body": redact(text_response.json()) if text_response.headers.get("content-type", "").startswith("application/json") else text_response.text[:300]}
        if text_response.status_code >= 400:
            result["status"] = "FAIL"
            return result

        tool_payload = {"model": model, "messages": BASE_MESSAGES, "tools": TOOLS, "tool_choice": "auto", "max_tokens": 256}
        tool_response = request_json(f"{base}/chat/completions", key, tool_payload)
        result["tools"]["initial"] = {"http": tool_response.status_code, "body": redact(tool_response.json()) if tool_response.headers.get("content-type", "").startswith("application/json") else tool_response.text[:500]}
        if tool_response.status_code >= 400:
            result["status"] = "FAIL"
            return result
        body = tool_response.json()
        message = ((body.get("choices") or [{}])[0].get("message") or {})
        calls = message.get("tool_calls") or []
        if calls:
            follow_messages = BASE_MESSAGES + [message]
            for call in calls:
                follow_messages.append({"role": "tool", "tool_call_id": call.get("id"), "name": ((call.get("function") or {}).get("name") or "current_local_time"), "content": json.dumps({"timezone": "Asia/Riyadh", "local_time": "2026-08-17T12:00:00+03:00", "ok": True})})
            follow_payload = {"model": model, "messages": follow_messages, "tools": TOOLS, "tool_choice": "auto", "max_tokens": 256}
            follow_response = request_json(f"{base}/chat/completions", key, follow_payload)
            result["tools"]["followup"] = {"http": follow_response.status_code, "body": redact(follow_response.json()) if follow_response.headers.get("content-type", "").startswith("application/json") else follow_response.text[:500]}
            if follow_response.status_code >= 400:
                result["status"] = "FAIL"
                return result
            result["tools"]["calls"] = len(calls)
        else:
            result["tools"]["calls"] = 0
            result["tools"]["note"] = "Model answered without a tool call; no contract failure by itself."

        stream_payload = {"model": model, "messages": [{"role": "user", "content": "Reply with exactly: KIMO_STREAM_OK"}], "stream": True, "max_tokens": 32}
        stream_response = request_json(f"{base}/chat/completions", key, stream_payload, stream=True)
        if stream_response.status_code >= 400:
            result["stream"] = {"http": stream_response.status_code, "body": stream_response.text[:300], "status": "BLOCKED"}
        else:
            result["stream"] = {"http": stream_response.status_code, "parsed": parse_stream(stream_response), "status": "PASS"}
    except Exception as exc:
        result["status"] = "FAIL"
        result["error"] = str(exc)[:500]
    return result


def main() -> int:
    keys = {"gemini": os.environ.get("KIMO_GEMINI_KEY", ""), "mistral": os.environ.get("KIMO_MISTRAL_KEY", "")}
    if not all(keys.values()):
        print("Missing temporary provider keys", file=sys.stderr)
        return 2
    discovered = {}
    selected = {}
    failures = []
    for provider, key in keys.items():
        try:
            rows = list_models(provider, key)
            discovered[provider] = [{"id": row.get("id"), "created": row.get("created"), "owned_by": row.get("owned_by")} for row in rows]
            selected[provider] = choose_models(provider, rows)
        except Exception as exc:
            discovered[provider] = {"error": str(exc)[:500]}
            selected[provider] = []
            failures.append({"provider": provider, "stage": "list_models", "error": str(exc)[:500]})

    jobs = [(provider, keys[provider], model) for provider in keys for model in selected.get(provider, [])]
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(run_model, provider, key, model) for provider, key, model in jobs]
        for future in futures:
            row = future.result()
            results.append(row)
            if row.get("status") == "FAIL":
                failures.append({"provider": row.get("provider"), "model": row.get("model"), "error": row.get("error") or row.get("tools", {}).get("followup") or row.get("text")})

    report = {"generatedAt": datetime.now(timezone.utc).isoformat(), "discovered": discovered, "selected": selected, "results": results, "failures": failures, "secretsStored": False}
    output_path = "/home/ubuntu/property-manager-app/docs/LIVE_PROVIDER_PROBE_AR.json"
    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(json.dumps({"selected": selected, "resultCount": len(results), "failureCount": len(failures), "output": output_path}, ensure_ascii=False))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
