# Kimo Engine (Python)

محرك وكيل **كيمو** مبني على **بايثون** — نسخة مخصّصة من تطبيق مدير العقارات،
معدّة لتشغيل الوكيل بمحرك بايثون **قوي وسريع ومرن**.

> هذا المجلد `python-agent/` يحتوي على المحرك البديل. النسخة الأصلية
> الحرفية من محرك كيمو موجودة في `kimo-engine-preview/` (للرجوع إليها فقط،
> بلا تعديل).

## ما الذي يقدّمه هذا المحرك

- **حلقة ReAct كاملة** (`kimo/loop.py`) تفكّر → تستدعي أدوات → تراقب النتيجة → تعيد الكرة.
- **طبقة مزوّدين** (`kimo/config.py`, `kimo/llm.py`) تدعم OpenAI / Anthropic /
  Mistral / Gemini / DeepSeek / Ollama وأي نقطة متوافقة مع واجهة OpenAI،
  مع إعادة محاولة وتراجع أسي (backoff) عند الأعطال العابرة.
- **سجل أدوات + تحقق صارم** (`kimo/tools.py`): كل نداء يُتحقَّق من مخططه
  **قبل التنفيذ**، وغلاف `execute` يُعاد التحقق من أداته الداخلية.
- **بوابة إثبات القراءة**: الطلبات التي تطلب أرقاماً/حالة محلية لا تُختم
  بنص النموذج وحده — بل بأداة قراءة فعلية، وإلا أُعيد الطلب أو يُسجَّل فشل صريح.
- **مهارات ونوايا وتخطيط** (`kimo/skills.py`, `kimo/intent.py`) لتوجيه الأدوات
  والإرشاد النظامي حسب نوع المهمة.
- **خلفية أدوات قابلة للتوصيل** (`ToolBackend`): اربط المحرك بأي مصدر بيانات
  (SQLite، API، عملية معزولة) دون تعديل زمن التشغيل.
- **صفر اعتماديات صلبة**: يستخدم مكتبة Python القياسية فقط (urllib)، فيعمل
  في أي بيئة. يمكن استبدال عميل HTTP بآخر قائم على `httpx` لأعلى إنتاجية.

## البنية

```
python-agent/
  kimo/                  حزمة المحرك
    __init__.py          واجهة عامة نظيفة
    config.py            المزوّدون + ملفات الموديلات + الإعدادات
    llm.py               عميل المحادثة + إعادة المحاولة (OpenAI-compatible)
    tools.py             السجل + التحقق + التنفيذ + ToolBackend
    builtin_tools.py     أدوات افتراضية آمنة (الوقت، echo، اسأل، أكّد، execute)
    skills.py            توجيه المهارات + التخطيط
    intent.py            تحليل النية + ملخص السياق
    prompts.py           بناء سطر النظام
    session.py           تخزين المحادثة/الجلسات (قابل للتوصيل)
    loop.py              حلقة ReAct الأساسية مع كل الحرّاس
    engine.py            الواجهة العامة: send_user_message / answer_ask / ...
    types.py             الأنواع المشتركة + أحداث المحرك
  examples/
    smoke_test.py        اختبار دخان دون شبكة (سيناريوهات A/B/C)
  kimo-engine-preview/   نسخة حرفية كاملة من المحرك الأصلي (بلا تعديل)
  PREVIEW.md             وصف نسخة المعاينة
  pyproject.toml         تعريف الحزمة
```

## التشغيل السريع

```bash
cd python-agent
python3 examples/smoke_test.py        # اختبار دون شبكة
```

ربط المحرك بمزوّد حقيقي وأدوات المجال:

```python
import asyncio
from kimo.engine import AgentEngine, SendOptions
from kimo.config import AgentSettings
from kimo.tools import ToolArg, ToolResult

async def main():
    settings = AgentSettings(
        provider_id="openai",
        model="gpt-4o-mini",
        api_key="sk-...",
    )
    engine = AgentEngine(settings)

    # سجّل أداة مجال خاصة بك:
    def query_properties(args, ctx):
        # ... استعلام قاعدة البيانات ...
        return ToolResult(ok=True, data=[...], observation="وجدت 4 عقارات")
    engine.registry.register_handler(
        "query",
        "استعلام عن كيانات التطبيق.",
        [ToolArg("entity", "string", required=True),
         ToolArg("filter", "object")],
        query_properties,
        read_only=True,
        category="data",
    )

    session = await engine.create_session("عمل جديد")
    await engine.send_user_message(session.id, "اعرض العقارات المتاحة للبيع")

asyncio.run(main())
```

## الحرّاس الموروثة من المحرك الأصلي

| الحارس | السلوك |
|--------|--------|
| تحقق قبل التنفيذ | أي نداء أداة يُتحقَّق من أنواعه/حقوله المطلوبة قبل اللمس بالبيانات |
| غلاف `execute` | يُعاد التحقق من الأداة الداخلية بنفس تعريفها |
| بوابة الإثبات | القراءة التي تستوجب بيانات لا تُختم بنص مُهلَّف |
| كشف التكرار | نداء متطابق بنفس النتيجة يُوقَف بعد حد أقصى |
| حدود التنفيذ | عدد الجولات/النداءات/الزمن الأقصى يحمي النظام |
| الموافقة | `request_confirmation`/`ask_user` يوقفان الحلقة وينتظران المستخدم |

## الفرق عن النسخة الأصلية

- الأصل: TypeScript/Expo، يعتمد على قاعدة SQLite داخل التطبيق وواجهات RN.
- هذه النسخة: بايثون نقي، مع `ToolBackend` قابل للتوصيل وطبقة مزوّدين
  متعددة، وبنية غير متزامنة سريعة (`asyncio`) جاهزة للإنتاج.
