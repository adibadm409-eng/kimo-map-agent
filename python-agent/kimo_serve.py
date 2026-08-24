#!/usr/bin/env python3
"""خادم المحرك الكامل — يحاكي سلوك المحرك القديم بتمامه، والفرق السرعة فقط.

المحرك البايثوني هنا هو «العقل الكامل» تماماً مثل المحرك القديم:
يُدير حلقة التفكير، يطلب مزوّد النموذج، ينفّذ الأدوات، ويتحقق قبل الكتابة.
تطبيق إكسبو (أو متصفح) هو مجرد واجهة ترسل الرسالة وتعرض الرد.

نقاط النهاية:
  GET  /api/providers   قائمة المزوّدات
  GET  /api/settings    إعدادات المحرك
  POST /api/settings    حفظ الإعدادات
  POST /api/session     إنشاء جلسة
  POST /api/chat        إرسال رسالة وانتظار الرد النهائي (كالمحرك القديم)
  GET  /                شاشة محادثة ويب للتجربة

التشغيل:  python3 kimo_serve.py  ثم افتح http://localhost:8000
"""

from __future__ import annotations

import asyncio
import json
import os
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer

from kimo.config_store import load_settings, save_settings, providers_catalog
from kimo.config import AgentSettings
from kimo.host import build_agent
from kimo.integration.store import SqliteStore
from kimo.integration.app_session_store import AppSessionStore


PORT = 8000


class EngineHub:
    """نسخة واحدة من المحرك الكامل تخدم المحادثات."""

    def __init__(self, db_path: str = "kimo.db") -> None:
        # في التطبيق المبني يشارك المحرك قاعدة التطبيق: نفس الملف لبيانات
        # المجال (SqliteStore) ومخزن الجلسات (AppSessionStore)، فيكتب المحرك
        # المحادثة في جداول agent_messages/agent_sessions مباشرةً.
        self.db = SqliteStore(db_path)
        self.session_store = AppSessionStore(db_path)
        self.engine, _ = build_agent(db_path=db_path, session_store=self.session_store)
        if os.environ.get("KIMO_MOCK"):
            from kimo.host import make_mock_client
            self.engine.client = make_mock_client()

    def create_session(self) -> str:
        return asyncio.run(self.engine.create_session(title="محادثة كيمو")).id

    def chat(self, session_id: str, text: str) -> dict:
        collected: list[dict] = []
        final_text = ""

        def on_event(e):
            item = {"type": e.type}
            for attr in ("name", "content", "ok", "status", "title", "detail", "observation"):
                v = getattr(e, attr, None)
                if v is not None:
                    item[attr] = v
            collected.append(item)
            if e.type == "text":
                nonlocal final_text
                final_text = e.content or final_text

        off = self.engine.on_event(on_event)
        try:
            asyncio.run(self.engine.send_user_message(session_id, text))
        finally:
            off()
        return {"answer": final_text, "events": collected}


HUB: EngineHub | None = None


def _get_hub() -> EngineHub:
    global HUB
    if HUB is None:
        HUB = EngineHub()
    return HUB


def _current_settings() -> dict:
    s = load_settings()
    return {
        "provider_id": s.provider_id, "provider_name": s.provider_name,
        "model": s.model, "base_url": s.base_url, "api_key": s.api_key,
        "mode": s.mode, "language": s.language,
        "temperature": s.temperature, "max_tokens": s.max_tokens,
        "max_tool_rounds": s.max_tool_rounds,
    }


class _Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False)
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        if "application/json" in self.headers.get("Content-Type", ""):
            return json.loads(raw)
        return {k: v for k, v in urllib.parse.parse_qsl(raw)}

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path in ("/", "/index.html"):
            self._send(200, _CHAT_PAGE, "text/html; charset=utf-8")
        elif path == "/api/providers":
            self._send(200, providers_catalog())
        elif path == "/api/settings":
            self._send(200, _current_settings())
        else:
            self._send(404, {"error": "غير موجود"})

    def do_POST(self):
        path = self.path
        data = self._body()
        if path == "/api/settings":
            s = AgentSettings(
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
            save_settings(s)
            global HUB
            HUB = None
            self._send(200, {"ok": True})
        elif path == "/api/session":
            self._send(200, {"session_id": _get_hub().create_session()})
        elif path == "/api/chat":
            hub = _get_hub()
            sid = data.get("session_id") or hub.create_session()
            result = hub.chat(sid, data.get("text", ""))
            self._send(200, {"session_id": sid, **result})
        else:
            self._send(404, {"error": "غير موجود"})

    def log_message(self, *args):
        pass


_CHAT_PAGE = """<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>محادثة كيمو</title>
<style>
:root{--bg:#0f172a;--card:#1e293b;--fg:#e2e8f0;--accent:#38bdf8;--bub:#334155}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,Tahoma,sans-serif;background:var(--bg);color:var(--fg)}
.wrap{max-width:720px;margin:auto;height:100vh;display:flex;flex-direction:column}
header{padding:14px 18px;background:var(--card);font-weight:700}
#log{flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:10px}
.msg{max-width:80%;padding:10px 14px;border-radius:12px;white-space:pre-wrap;line-height:1.5}
.user{align-self:flex-end;background:var(--accent);color:#06283d}
.assistant{align-self:flex-start;background:var(--bub)}
.tool{font-size:12px;color:#94a3b8;align-self:flex-start;background:#0b1220;border:1px solid #1e293b;padding:6px 10px;border-radius:8px;max-width:90%}
.input{display:flex;gap:8px;padding:12px;background:var(--card)}
.input input{flex:1;padding:11px;border-radius:9px;border:1px solid #334155;background:#0f172a;color:var(--fg)}
.input button{padding:11px 18px;border:none;border-radius:9px;background:var(--accent);color:#06283d;font-weight:700;cursor:pointer}
</style></head>
<body><div class="wrap">
<header>محادثة كيمو — المحرك البايثوني الكامل</header>
<div id="log"></div>
<div class="input"><input id="t" placeholder="اكتب رسالتك..."><button onclick="send()">إرسال</button></div>
</div>
<script>
const log=document.getElementById('log');
let sid=null;
function add(cls,text){const d=document.createElement('div');d.className=cls;d.textContent=text;log.appendChild(d);log.scrollTop=log.scrollHeight;}
async function ensureSession(){if(!sid){const r=await fetch('/api/session',{method:'POST'});sid=(await r.json()).session_id;}}
async function send(){
  const t=document.getElementById('t');const text=t.value.trim();if(!text)return;t.value='';
  add('user',text);
  await ensureSession();
  add('assistant','… يفكّر وينفّذ');
  const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:sid,text})});
  const j=await r.json();
  log.lastChild.remove();
  (j.events||[]).forEach(e=>{if(e.type==='observation')add('tool','• '+((e.title||'')+': '+(e.detail||'')).slice(0,160));});
  add('assistant',j.answer||'(لا يوجد رد)');
}
document.getElementById('t').addEventListener('keydown',e=>{if(e.key==='Enter')send();});
</script></body></html>"""


def main() -> None:
    server = HTTPServer(("0.0.0.0", PORT), _Handler)
    print(f"خادم محرك كيمو الكامل يعمل على:  http://localhost:{PORT}")
    print("شغّل تطبيق إكسبو على نفس الجهاز/الشبكة ووجّهه إلى عنوان IP لهذا الجهاز.")
    print("اضغط Ctrl+C للإيقاف.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
