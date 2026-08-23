#!/usr/bin/env python3
"""Provider settings screen for the new Kimo engine — a dependency-free web UI.

Mirrors the old RN ``AgentSettings.tsx`` (provider picker, API key, editable
base URL, per-provider model list, mode, language, temperature, max tokens,
and a live connection test) but serves it over stdlib ``http.server`` and
persists to ``kimo_config.json`` consumed by :func:`kimo.config_store.resolve_settings`.

Run:  ``python3 settings_ui.py``  then open  http://localhost:8765
"""

from __future__ import annotations

import asyncio
import html
import json
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer

from kimo.config_store import load_settings, save_settings, providers_catalog
from kimo.config import AgentSettings, default_provider
from kimo.llm import ChatClient, chat_with_retry
from kimo.types import ChatMessage


PORT = 8765


def _current_settings_dict() -> dict:
    s = load_settings()
    return {
        "provider_id": s.provider_id,
        "provider_name": s.provider_name,
        "model": s.model,
        "base_url": s.base_url,
        "api_key": s.api_key,
        "mode": s.mode,
        "language": s.language,
        "temperature": s.temperature,
        "max_tokens": s.max_tokens,
        "max_tool_rounds": s.max_tool_rounds,
    }


def _handle_test(payload: dict) -> dict:
    provider = payload.get("provider_id") or "openai"
    model = payload.get("model") or ""
    api_key = payload.get("api_key") or ""
    base_url = payload.get("base_url") or ""
    if not api_key:
        return {"ok": False, "message": "أدخل مفتاح API أولاً."}
    settings = AgentSettings(
        provider_id=provider, provider_name=payload.get("provider_name"),
        model=model, base_url=base_url or None, api_key=api_key,
        mode=payload.get("mode", "supervisor"), language=payload.get("language", "ar"),
    )
    try:
        conn = settings.active_config()
        provider_def = default_provider(settings.provider_id).to_proxy(
            base_url=conn["baseUrl"], name=conn["providerName"])
        client = ChatClient()
        msgs = [ChatMessage(role="system", content="اختصار: أجب بكلمة واحدة فقط: حسناً."),
                ChatMessage(role="user", content="تحقق")]
        result = asyncio.run(chat_with_retry(
            client, provider_def, base_url=conn["baseUrl"], api_key=api_key,
            model=model, messages=msgs, functions=[], max_tokens=8, temperature=0,
            retry_delays=(1, 2),
        ))
        content = (result.content or "").strip()
        return {"ok": True, "message": f"الاتصال نجح ✓ (رد النموذج: {content[:40]})"}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "message": f"فشل الاتصال: {type(e).__name__}: {e}"}


class _Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: str, ctype: str = "text/html; charset=utf-8") -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body.encode("utf-8"))))
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0]
        if path in ("/", "/index.html"):
            self._send(200, _PAGE)
        elif path == "/api/providers":
            self._send(200, json.dumps(providers_catalog(), ensure_ascii=False), "application/json")
        elif path == "/api/settings":
            self._send(200, json.dumps(_current_settings_dict(), ensure_ascii=False), "application/json")
        else:
            self._send(404, "غير موجود")

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length).decode("utf-8")
        ctype = self.headers.get("Content-Type", "")
        if "application/json" in ctype:
            data = json.loads(raw)
        else:
            data = {k: v for k, v in urllib.parse.parse_qsl(raw)}

        if self.path == "/save":
            settings = AgentSettings(
                provider_id=data.get("provider_id", "openai"),
                provider_name=data.get("provider_name") or None,
                model=data.get("model", ""),
                base_url=data.get("base_url") or None,
                api_key=data.get("api_key") or None,
                mode=data.get("mode", "supervisor"),
                language=data.get("language", "ar"),
                temperature=float(data.get("temperature", 0.2)),
                max_tokens=int(data.get("max_tokens", 4000)),
                max_tool_rounds=int(data.get("max_tool_rounds", 12)),
            )
            path = save_settings(settings)
            self._send(200, json.dumps({"ok": True, "path": path}, ensure_ascii=False), "application/json")
        elif self.path == "/api/test":
            self._send(200, json.dumps(_handle_test_handler(data), ensure_ascii=False), "application/json")
        else:
            self._send(404, "غير موجود")

    def log_message(self, *args) -> None:  # silence default logging
        pass


def _handle_test_handler(data: dict) -> dict:
    return _handle_test(data)


_PAGE = """<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>إعدادات مزوّد كيمو</title>
<style>
  :root{--bg:#0f172a;--card:#1e293b;--fg:#e2e8f0;--accent:#38bdf8;--ok:#22c55e;--err:#ef4444}
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,'Segoe UI',Tahoma,sans-serif;background:var(--bg);color:var(--fg);padding:24px}
  .wrap{max-width:640px;margin:auto}
  h1{font-size:22px;margin-bottom:4px}
  .sub{color:#94a3b8;margin-bottom:20px;font-size:13px}
  .card{background:var(--card);border-radius:14px;padding:20px;box-shadow:0 8px 30px rgba(0,0,0,.3)}
  label{display:block;margin:14px 0 6px;font-size:14px;color:#cbd5e1}
  input,select{width:100%;padding:11px;border-radius:9px;border:1px solid #334155;background:#0f172a;color:var(--fg);font-size:14px}
  .row{display:flex;gap:12px}
  .row>*{flex:1}
  button{cursor:pointer;border:none;border-radius:9px;padding:12px 18px;font-size:14px;font-weight:600}
  .primary{background:var(--accent);color:#06283d}
  .ghost{background:#334155;color:var(--fg)}
  .actions{display:flex;gap:12px;margin-top:22px}
  #status{margin-top:16px;font-size:14px;min-height:20px}
  .ok{color:var(--ok)} .err{color:var(--err)}
  .hint{font-size:12px;color:#94a3b8;margin-top:4px}
</style>
</head>
<body>
<div class="wrap">
  <h1>إعدادات مزوّد كيمو</h1>
  <div class="sub">محرك بايثون — متوافق مع إعدادات المحرك الجديد</div>
  <div class="card">
    <label>المزوّد</label>
    <select id="provider"></select>
    <div class="hint" id="providerHint"></div>

    <label>مفتاح API</label>
    <input id="api_key" type="password" placeholder="sk-..." autocomplete="off">

    <label>عنوان القاعدة (Base URL) — اختياري</label>
    <input id="base_url" placeholder="يُملأ تلقائياً من المزوّد">

    <label>الموديل</label>
    <select id="model"></select>

    <div class="row">
      <div>
        <label>النمط</label>
        <select id="mode">
          <option value="supervisor">مشرف (تنفيذ + تحقّق)</option>
          <option value="assistant">مساعد (محادثة)</option>
        </select>
      </div>
      <div>
        <label>اللغة</label>
        <select id="language">
          <option value="ar">العربية</option>
          <option value="en">الإنجليزية</option>
        </select>
      </div>
    </div>

    <div class="row">
      <div>
        <label>درجة الحرارة (<span id="tempv">0.2</span>)</label>
        <input id="temperature" type="range" min="0" max="1" step="0.05" value="0.2">
      </div>
      <div>
        <label>أقصى الرموز</label>
        <input id="max_tokens" type="number" value="4000" min="256" max="32000">
      </div>
    </div>

    <label>أقصى جولات الأدوات</label>
    <input id="max_tool_rounds" type="number" value="12" min="1" max="60">

    <div class="actions">
      <button class="primary" id="save">حفظ الإعدادات</button>
      <button class="ghost" id="test">اختبار الاتصال</button>
    </div>
    <div id="status"></div>
  </div>
</div>
<script>
const $ = id => document.getElementById(id);
let PROVIDERS = [];
async function init(){
  PROVIDERS = await (await fetch('/api/providers')).json();
  const s = await (await fetch('/api/settings')).json();
  const sel = $('provider');
  PROVIDERS.forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name;sel.appendChild(o);});
  sel.value = s.provider_id || PROVIDERS[0].id;
  fillModels(sel.value, s.model);
  $('api_key').value = s.api_key || '';
  $('base_url').value = s.base_url || '';
  $('mode').value = s.mode || 'supervisor';
  $('language').value = s.language || 'ar';
  $('temperature').value = s.temperature ?? 0.2;
  $('tempv').textContent = $('temperature').value;
  $('max_tokens').value = s.max_tokens || 4000;
  $('max_tool_rounds').value = s.max_tool_rounds || 12;
  sel.onchange = ()=>fillModels(sel.value);
  $('temperature').oninput = ()=>$('tempv').textContent=$('temperature').value;
}
function fillModels(pid, selected){
  const p = PROVIDERS.find(x=>x.id===pid);
  $('providerHint').textContent = p?.hint || '';
  if(p?.base_url) $('base_url').placeholder = p.base_url;
  const m = $('model'); m.innerHTML='';
  (p?.default_models||[]).forEach(mdl=>{const o=document.createElement('option');o.value=mdl;o.textContent=mdl;m.appendChild(o);});
  if(selected) m.value = selected;
}
function status(msg, cls){const e=$('status');e.textContent=msg;e.className=cls||'';}
$('save').onclick = async ()=>{
  const payload = {
    provider_id: $('provider').value,
    api_key: $('api_key').value,
    base_url: $('base_url').value,
    model: $('model').value,
    mode: $('mode').value,
    language: $('language').value,
    temperature: parseFloat($('temperature').value),
    max_tokens: parseInt($('max_tokens').value,10),
    max_tool_rounds: parseInt($('max_tool_rounds').value,10),
  };
  const r = await fetch('/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const j = await r.json();
  status(j.ok ? 'تم حفظ الإعدادات ✓ في '+(j.path||'') : 'تعذّر الحفظ', j.ok?'ok':'err');
};
$('test').onclick = async ()=>{
  status('جارٍ اختبار الاتصال...');
  const payload = {
    provider_id: $('provider').value, api_key: $('api_key').value,
    base_url: $('base_url').value, model: $('model').value,
    mode: $('mode').value, language: $('language').value,
  };
  const r = await fetch('/api/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const j = await r.json();
  status(j.message, j.ok?'ok':'err');
};
init();
</script>
</body>
</html>"""


def main() -> None:
    server = HTTPServer(("0.0.0.0", PORT), _Handler)
    print(f"شاشة إعدادات كيمو تعمل على:  http://localhost:{PORT}")
    print("اضغط Ctrl+C للإيقاف.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
