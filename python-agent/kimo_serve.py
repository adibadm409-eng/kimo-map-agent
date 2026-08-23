#!/usr/bin/env python3
"""خادم أدوات المجال — يعمل محلياً ويفصح أدوات المحرك البايثوني عبر HTTP.

معمارية التشغيل المحلي (كما طُلب):
  - تطبيق إكسبو (على الهاتف) هو من يتواصل مع مزوّدي النماذج مباشرةً.
  - محرك البايثون المحلي (هذا الخادم) يوفّر أدوات المجال فقط
    (استعلام/إنشاء/تعديل/تحليلات) ويُنفّذها على قاعدة البيانات المحلية.

نقاط النهاية:
  GET  /api/tools       تعريفات الأدوات الجاهزة للاستدعاء من التطبيق
  POST /api/tool        تنفيذ أداة {name, args} وإرجاع النتيجة
  GET  /api/providers   قائمة المزوّدات المدعومة
  GET  /api/settings    إعدادات المحرك (المزوّد/الموديل/المفتاح)
  POST /api/settings    حفظ الإعدادات
  GET  /api/entities    الكيانات المتاحة (للواجهة)

التشغيل:  python3 kimo_serve.py  ثم افتح على نفس الجهاز/الشبكة.
"""

from __future__ import annotations

import json
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer

from kimo.config_store import load_settings, save_settings, providers_catalog
from kimo.config import AgentSettings
from kimo.integration.backend import build_integration_registry
from kimo.integration.store import SqliteStore
from kimo.tools import ToolCall


PORT = 8000


class ToolHub:
    """يحمل سجل الأدوات المحلية ويُنفّذها."""

    def __init__(self, db_path: str = "kimo.db") -> None:
        self.db = SqliteStore(db_path)
        self.registry = build_integration_registry(self.db)

    def tool_defs(self) -> list[dict]:
        return self.registry.function_defs()

    def execute(self, name: str, args: str) -> dict:
        result = ToolCall(id="srv", name=name, arguments=args)
        outcome = self.registry.execute(result, ctx=None)
        return {
            "ok": outcome.ok,
            "data": outcome.data,
            "error": outcome.error,
            "observation": outcome.observation,
        }


HUB: ToolHub | None = None


def _get_hub() -> ToolHub:
    global HUB
    if HUB is None:
        HUB = ToolHub()
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
        if path == "/api/tools":
            self._send(200, _get_hub().tool_defs())
        elif path == "/api/providers":
            self._send(200, providers_catalog())
        elif path == "/api/settings":
            self._send(200, _current_settings())
        elif path == "/api/entities":
            self._send(200, [t["function"]["name"] for t in _get_hub().tool_defs()])
        elif path in ("/", "/index.html"):
            self._send(200, _STATUS_PAGE, "text/html; charset=utf-8")
        else:
            self._send(404, {"error": "غير موجود"})

    def do_POST(self):
        path = self.path
        data = self._body()
        if path == "/api/tool":
            name = data.get("name", "")
            args = data.get("arguments")
            if isinstance(args, dict):
                args = json.dumps(args, ensure_ascii=False)
            self._send(200, _get_hub().execute(name, args or "{}"))
        elif path == "/api/settings":
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
            self._send(200, {"ok": True})
        else:
            self._send(404, {"error": "غير موجود"})

    def log_message(self, *args):
        pass


_STATUS_PAGE = """<!DOCTYPE html><html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><title>خادم أدوات كيمو</title></head><body style="font-family:Tahoma;background:#0f172a;color:#e2e8f0;padding:24px">
<h2>خادم أدوات محرك كيمو المحلي</h2>
<p>هذا الخادم يقدّم أدوات المجال لتطبيق إكسبو المحلي. التطبيق هو من يطلب مزوّدات النماذج.</p>
<ul>
<li><code>GET /api/tools</code> — تعريفات الأدوات</li>
<li><code>POST /api/tool</code> — تنفيذ أداة</li>
<li><code>GET /api/settings</code> — إعدادات المحرك</li>
</ul></body></html>"""


def main() -> None:
    server = HTTPServer(("0.0.0.0", PORT), _Handler)
    print(f"خادم أدوات كيمو المحلي يعمل على:  http://localhost:{PORT}")
    print("شغّل تطبيق إكسبو على نفس الجهاز/الشبكة ووجّهه إلى عنوان IP لهذا الجهاز.")
    print("اضغط Ctrl+C للإيقاف.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
