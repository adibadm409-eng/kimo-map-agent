import json
import os
from datetime import datetime, timezone
import requests

CASES = [
    ("gemini", "models/gemini-3-flash-preview"),
    ("mistral", "mistral-medium-2505"),
    ("mistral", "mistral-medium-2508"),
    ("mistral", "devstral-2512"),
    ("mistral", "voxtral-small-latest"),
]

def redact(v):
    if isinstance(v, dict):
        return {k: redact(x) for k, x in v.items() if k.lower() not in {"key", "token", "authorization", "api_key"}}
    if isinstance(v, list):
        return [redact(x) for x in v]
    return v

out = {"generatedAt": datetime.now(timezone.utc).isoformat(), "models": [], "secretsStored": False}
for provider, model in CASES:
    key = os.environ.get("KIMO_GEMINI_KEY" if provider == "gemini" else "KIMO_MISTRAL_KEY", "")
    if not key:
        continue
    if provider == "gemini":
        url = f"https://generativelanguage.googleapis.com/v1beta/openai/models/{model.removeprefix('models/')}"
    else:
        url = f"https://api.mistral.ai/v1/models/{model}"
    response = requests.get(url, headers={"Authorization": f"Bearer {key}"}, timeout=35)
    try:
        body = response.json()
    except Exception:
        body = response.text[:500]
    out["models"].append({"provider": provider, "model": model, "http": response.status_code, "body": redact(body)})
path = "/home/ubuntu/property-manager-app/docs/LIVE_CAPABILITIES_AR.json"
with open(path, "w", encoding="utf-8") as handle:
    json.dump(out, handle, ensure_ascii=False, indent=2)
    handle.write("\n")
print(json.dumps({"path": path, "models": [{"provider": x["provider"], "model": x["model"], "http": x["http"]} for x in out["models"]]}, ensure_ascii=False))
