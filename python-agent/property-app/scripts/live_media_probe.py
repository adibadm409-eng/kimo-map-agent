import base64
import io
import json
import os
import struct
import wave
from datetime import datetime, timezone
from typing import Any

import requests

# 1x1 transparent PNG, generated fixture only; no user data.
PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

def wav_b64() -> str:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(8000)
        audio.writeframes(struct.pack("<h", 0) * 800)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: redact(v) for k, v in value.items() if k.lower() not in {"key", "token", "authorization", "api_key"}}
    if isinstance(value, list):
        return [redact(v) for v in value]
    return value


def request(provider: str, model: str, key: str, content: list[dict]) -> tuple[int, Any]:
    base = "https://generativelanguage.googleapis.com/v1beta/openai" if provider == "gemini" else "https://api.mistral.ai/v1"
    response = requests.post(
        f"{base}/chat/completions",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={"model": model, "messages": [{"role": "user", "content": content}], "max_tokens": 80},
        timeout=45,
    )
    try:
        body = response.json()
    except Exception:
        body = response.text[:1000]
    return response.status_code, redact(body)


def run(provider: str, model: str, key: str, media: str) -> dict:
    row = {"provider": provider, "model": model, "media": media, "status": "PASS", "http": None, "body": None}
    try:
        if media == "vision":
            content = [
                {"type": "text", "text": "Inspect this image and reply exactly IMAGE_INPUT_OK if it is a valid image input."},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{PNG_B64}"}},
            ]
        elif media == "audio-gemini":
            content = [
                {"type": "text", "text": "This is a silent WAV fixture. Reply exactly AUDIO_INPUT_OK if the audio input format is accepted."},
                {"type": "input_audio", "input_audio": {"data": wav_b64(), "format": "wav"}},
            ]
        else:
            content = [
                {"type": "text", "text": "This is a silent WAV fixture. Reply exactly AUDIO_INPUT_OK if the audio input format is accepted."},
                {"type": "input_audio", "input_audio": wav_b64()},
            ]
        status, body = request(provider, model, key, content)
        row["http"] = status
        row["body"] = body
        if status == 429:
            row["status"] = "BLOCKED_QUOTA"
        elif status >= 400:
            row["status"] = "FAIL"
    except Exception as error:
        row["status"] = "FAIL"
        row["body"] = str(error)[:500]
    return row


def main():
    cases = [
        ("gemini", "models/gemini-3-flash-preview", os.environ.get("KIMO_GEMINI_KEY", ""), "vision"),
        ("gemini", "models/gemini-3-flash-preview", os.environ.get("KIMO_GEMINI_KEY", ""), "audio-gemini"),
        ("mistral", "mistral-medium-2508", os.environ.get("KIMO_MISTRAL_KEY", ""), "vision"),
        ("mistral", "voxtral-small-latest", os.environ.get("KIMO_MISTRAL_KEY", ""), "audio-mistral"),
    ]
    results = [run(*case) for case in cases]
    report = {"generatedAt": datetime.now(timezone.utc).isoformat(), "results": results, "secretsStored": False}
    path = "/home/ubuntu/property-manager-app/docs/LIVE_MEDIA_PROBE_AR.json"
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(json.dumps({"path": path, "results": [{"provider": x["provider"], "model": x["model"], "media": x["media"], "status": x["status"], "http": x["http"]} for x in results]}, ensure_ascii=False))
    raise SystemExit(1 if any(x["status"] == "FAIL" for x in results) else 0)


if __name__ == "__main__":
    main()
