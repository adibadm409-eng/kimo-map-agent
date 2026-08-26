# Kimo Map Agent —.GetProperty Manager with Embedded AI Engine

## نظرة عامة

هذا المستودع يحتوي النسخة المحسّنة من تطبيق **مدير العقارات** مع محرك ذكاء اصطناعي مضمَّن (Kimo) يعمل مباشرة داخل التطبيق على جهاز المستخدم — **بدون خادم خارجي،بدون اتصال مستمر بالسحابة**.

---

## الفروقات الجوهرية بين الفرعين

### 1. محرك الذكاء الاصطناعي

| الميزة | الفرع الرئيسي (main) | هذا المستودع (kimo-embedded) |
|--------|----------------------|------------------------------|
| **محرك AI** | TypeScript فقط (executor.ts) | Python مضمَّن عبر Chaquopy |
| **تنفيذ الأدوات** | في الـ client (RN) | في المعالج مباشرة (Python in-process) |
| **قاعدة البيانات** | expo-sqlite (RN) | SQLite مشتركة (Python + RN نفس الملف) |
| **المزوّد** | يتطلب اتصال HTTP بالخادم | يعمل محلياً بدون خادم |
| **الخصوصية** | البيانات تمر عبر المزود | **البيانات لا تغ dispositivos** — كل شيء محلي |

### 2. بناء Android

| الميزة | الفرع الرئيسي | هذا المستودع |
|--------|---------------|--------------|
| **معمارية CPU** | arm64-v8a + armeabi-v7a | **arm64-v8a فقط** (95%+ من الأجهزة) |
| **حجم APK** | ~41.5 MB | **~25-30 MB** (تقريب 30% أصغر) |
| **Python** | غير موجود | Chaquopy 16.x مع Python 3.11 مضمَّن |
| **التوقيع** | توقيع واحد | نفس التوقيع (key alias: realestate) |
| **minify** | مفعّل | مفعّل + shrinkResources |

### 3. معمارية النظام

```
الفرع الرئيسي (main):
┌─────────────┐     HTTP      ┌──────────────┐
│  React Native │ ──────────→ │  الخادم (TS)  │
│  (الواجهة)   │ ←────────── │  (LLM API)   │
└─────────────┘              └──────────────┘
       │
       ▼
┌──────────────┐
│  expo-sqlite │
│  (البيانات)  │
└──────────────┘

هذا المستودع (kimo-embedded):
┌─────────────────────────────────────┐
│         Android Device               │
│  ┌─────────────┐  ┌──────────────┐  │
│  │ React Native │  │ Python Engine │  │
│  │  (الواجهة)   │←→│  (Kimo AI)    │  │
│  └──────┬──────┘  └──────┬───────┘  │
│         │                │           │
│         ▼                ▼           │
│  ┌──────────────────────────────┐   │
│  │     SQLite DB (مشتركة)       │   │
│  │     realestate.db            │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
```

### 4. الأدوات المتاحة للمحرك

المحرك المضمَّن يملك وعياً كاملاً بأدواته:

| الفئة | الأدوات |
|-------|---------|
| **القراءة** | `query`, `get`, `list` |
| **الكتابة** | `mutate_record` (إنشاء/تعديل/حذف) |
| **المشاريع** | `project_tree`, `project_financials`, `project_integrity_check` |
| **المالية** | `record_payment`, `installment_schedule`, `payment_ledger` |
| **التحليلات** | `dashboard_kpis`, `buyer_summary` |
| **الحوار** | `ask_user`, `request_confirmation` |

### 5. Agent Worker (عامل التنفيذ المستمر)

ملف `src/assistant/agentWorker.ts` — طبقة في الواجهة الأمامية:

- **تفكيك المهام**: يستخدم LLM لتحويل طلب المستخدم إلى خطوات تنفيذية
- **تتبع الحالة**: كل خطوة تُسجَّل كـ done/failed/pending
- **أحداث التقدم**: يبث أحداثاً للواجهة لتتبع التقدم لحظياً
- **استمرارية**: يبقى متصلاً بالمزود طوال التنفيذ

```typescript
// مثال على الاستخدام
const worker = getWorker()
const task = await worker.runTask(sessionId, "سجّل دفعة 50000 لمشروع النور")
// task.steps = [
//   { title: "البحث عن المشروع", status: "done" },
//   { title: "عرض الأقساط", status: "done" },
//   { title: "تسجيل الدفعة", status: "done" },
//   { title: "التحقق", status: "done" }
// ]
```

### 6. هيكل الملفات الرئيسي

```
kimo/                    ← محرك Python المضمَّن
├── engine.py            ← المحرك الرئيسي (AgentEngine)
├── loop.py              ← حلقة ReAct (فكر → نفّذ → راقب)
├── llm.py               ← عميل LLM (OpenAI-compatible)
├── tools.py             ← سجل الأدوات + التحقق
├── session.py           ← إدارة الجلسات والرسائل
├── skills.py            ← توجيه المهارات + التخطيط
├── prompts.py           ← بناء system prompt
├── intent.py            ← تحليل النية
├── config.py            ← إعدادات المزوّد والنماذج
├── builtin_tools.py     ← أدوات مدمجة (current_time, ask_user...)
├── orchestrator.py      ← وكيل تخطيط اختياري (LLM-aware)
└── integration/
    ├── backend.py       ← ربط الأدوات بقاعدة البيانات
    ├── store.py         ← مخزن SQLite
    ├── catalog.py       ← كتالوج الكيانات (13 كيان)
    ├── analytics.py     ← دوال التحليلات
    └── app_session_store.py ← كتابة جداول التطبيق

src/assistant/           ← كود TypeScript
├── agentWorker.ts       ← Agent Worker (جديد)
├── executor.ts          ← الموزع الرئيسي
├── kimoNative.ts        ← جسر RN → Python (Chaquopy)
├── kimoBridge.ts        ← جسر HTTP (احتياطي للتطوير)
└── ... (باقي ملفات assistant)

android-native/          ← الكود الأصلي
└── KimoEngineModule.kt  ← وحدة RN تستدعي Python عبر Chaquopy

scripts/
└── patch_chaquopy.py    ← ترقيع CI لربط Chaquopy
```

---

## بناء APK

### المتطلبات
- Node.js 18+
- Java 17 (Temurin)
- Android SDK + NDK 27.x

### الأمر
```bash
gh workflow run "Build Signed APK" -R adibadm409-eng/kimo-map-agent
```

### التوقيع
- **اسم المستعار**: realestate
- **بصمة SHA-256**: `F3:04:9A:C1:BA:86:43:59:5C:36:36:25:E6:6C:48:24:EA:82:D2:D7:FA:97:43:C0:51:38:C8:29:0A:FD:C2:A4`
- **صالح حتى**: ~2053

---

## ملاحظات تقنية

1. **Chaquopy 16.x**: يستخدم `chaquopy { defaultConfig { version "3.11" } }` (لا `python { version }`)
2. **المخزن**: `KIMO_DB_NAME = 'realestate.db'` — نفس قاعدة التطبيق
3. **الإرسال**: `KIMO_ENGINE_ENABLED = true` في `kimoBridge.ts`
4. **العملة**: جميع الأسعار بالجنيه المصري (EGP)
5. **اللغة**: واجهة عربية بالكامل + ردود عربية من المحرك

---

## الترخيص

تطبيق خاص — لا يُوزَّع دون إذن.
