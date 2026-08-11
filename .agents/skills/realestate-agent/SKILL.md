---
name: realestate-agent
description: "الوكيل الذكي لتطبيق العقارات: أدوات جلب/بحث/تعديل/إضافة/حذف/تصفية/حساب لكل بيانات التطبيق (العقارات، العملاء، العروض، الحملات، المعاينات، الخريطة، المشاريع، البلوكات، القطع، الأقساط، الحقول المخصصة). استخدمها عندما يطلب المستخدم إجراء عمليات على بيانات التطبيق أو إجابات تحتاج حساباً بين الجداول، خاصة قسم المشاريع (شجرة مشروع، حسابات مالية، جدولة تقسيط، ملخص مشترين، دفتر أقساط)."
---

# الوكيل الذكي لتطبيق العقارات والأراضي

هذا السكيل هو **عقل الوكيل**. كل عملياتك على بيانات التطبيق تتم حصرياً عبر الأدوات الموصوفة هنا.
**القاعدة الذهبية: لا تكتب SQL مباشرة ولا تعدّل السكيمة — استخدم الأدوات فقط.**

- التطبيق: تطبيق إدارة عقارات وخرائط ومشاريع أراضٍ سكنية (Expo React Native + SQLite محلي).
- جميع الأرقام المالية بالريال اليمني (ر.ي).
- واجهة استدعاء واحدة: `executeTool(name, args)` في `src/agent/registry.ts` — أو عبر الـ bridge عندما يُفعّل.

---

## 1) الكيانات (الجداول) المدعومة

| الكيان | المعنى | مفتاح العنوان | حقول مميزة |
|---|---|---|---|
| `properties` | العقارات | name | price, area, address, status, type, owner_* |
| `clients` | العملاء | name | phone, type (buyer/seller/both), budget_min/max |
| `offers` | العروض | notes | property_id→properties, client_id→clients, amount, status |
| `campaigns` | الحملات التسويقية | name | budget, start_date, end_date, status |
| `viewings` | المعاينات | notes | property_id, client_id, date_time, status |
| `waypoints` | نقاط الخريطة | name | latitude, longitude, price, owner_* |
| `areas` | المساحات على الخريطة | name | geojson, area_sqm, perimeter_m |
| `projects` | المشاريع السكنية | name | **له حقول مخصصة (EAV)** |
| `blocks` | البلوكات | name | project_id→projects, plot_count |
| `plots` | القطع | plot_no | block_id→blocks, status, boundaries, value, buyer_*, installment_type, paid/remaining |
| `plot_payments` | أقساط القطع | pay_date | plot_id→plots, amount, method, cash/bank details |
| `custom_fields` | الحقول المخصصة | label | entity_type (project/block/plot), value_type |
| `custom_field_values` | قيم الحقول المخصصة | value | entity_id, field_id, value |

**العلاقات (للجداول بينها):**
```
projects 1─→∞ blocks 1─→∞ plots 1─→∞ plot_payments
properties 1─→∞ offers / viewings  ← ∞─1 clients
projects|blocks|plots 1─→∞ custom_field_values (EAV)
```

---

## 2) الأدوات — المرجع الكامل

### أ. اكتشاف البنية
| الأداة | الوظيفة |
|---|---|
| `list_entities` | قائمة كل الكيانات مع حقولها وأنواعها وتسمياتها العربية وقابلية البحث/الفلترة — اطلبها أولاً إن كنت غير متأكد |

### ب. البحث والجلب
| الأداة | الوظيفة |
|---|---|
| `query` | **الأداة الرئيسية**: بحث متعدد الطبقات في أي كيان |
| `get` | سجل واحد بالمعرف (+ قيم مخصصة + أسماء مرتبطة) |
| `search_everything` | بحث نصي شامل في المشاريع/البلوكات/القطع دفعة واحدة |

### ج. الكتابة (إضافة/تعديل/حذف)
| الأداة | الوظيفة |
|---|---|
| `create` | إنشاء سجل في أي كيان |
| `update` | تعديل جزئي لسجل موجود |
| `delete` | حذف سجل (سلسلة للمشاريع/البلوكات/القطع) |
| `custom_field_set` | تعيين قيمة حقل مخصص لكيان |

### د. حسابات المشاريع (بين الجداول)
| الأداة | الوظيفة |
|---|---|
| `project_tree` | شجرة كاملة: مشروع ← بلوكات ← قطع ← أقساط + إحصائيات |
| `project_financials` | جدول مالي لكل قطعة + مقارنة عمود المدفوع بسجل الأقساط الفعلي + نسبة التحصيل |
| `installment_schedule` | جدولة الدفعات المتبقية حسب نوع التقسيط |
| `buyer_summary` | ملخص كل مشتري عبر كل المشاريع (عدد القطع، القيمة، المدفوع، المتبقي) |
| `payment_ledger` | دفتر الأقساط مع تصفية بالمشروع/البلوك/القطعة/الوسيلة/الفترة |
| `dashboard_kpis` | مؤشرات شاملة: عدّادات + مجاميع مالية لكل الكيانات |

---

## 3) أداة `query` — بناء الفلاتر (التصفية متعددة الطبقات)

```
query({ entity, search?, filters?, sort?, limit?, offset?, withCustomValues? })
```

- `entity` (مطلوب): أحد مفاتيح الجداول أعلاه.
- `search`: نص حر يبحث في كل الحقول القابلة للبحث (مثال: "قطعة 3"، "الواحة"، "خالد").
- `filters`: مصفوفة شروط AND:

| op | المعنى | مثال |
|---|---|---|
| `eq` | يساوي | `{field:"status", op:"eq", value:"installment"}` |
| `neq` | لا يساوي | `{field:"status", op:"neq", value:"available"}` |
| `contains` | يحتوي على (نص) | `{field:"buyer_name", op:"contains", value:"خالد"}` |
| `starts_with` / `ends_with` | يبدأ/ينتهي بـ | `{field:"plot_no", op:"starts_with", value:"قطعة"}` |
| `gt` / `gte` / `lt` / `lte` | أكبر/أصغر | `{field:"remaining_amount", op:"gt", value:200000}` |
| `between` | بين قيمتين (value + value2) | `{field:"value", op:"between", value:500000, value2:1000000}` |
| `in` / `not_in` | ضمن/خارج قائمة | `{field:"status", op:"in", value:["sold","installment"]}` |
| `is_empty` / `not_empty` | فارغ/غير فارغ | `{field:"buyer_name", op:"is_empty"}` |

- `sort`: `{field:"created_at", dir:"desc"}` — الحقل يجب أن يكون قابلاً للترتيب.
- `limit` (افتراضي 2000): عدد النتائج. `offset`: إزاحة.
- `withCustomValues` (افتراضي true): يضيف كائن `custom_values` للقطع/البلوكات/المشاريع بقيم الحقول المخصصة.

**أمثلة مركّبة (تصفية متعددة الطبقات):**
```json
// قطع قيد التقسيط بقيمة > 500 ألف في بلوك معين
{ "entity": "plots", "filters": [
    { "field": "block_id", "op": "eq", "value": "BLK_ID" },
    { "field": "status", "op": "eq", "value": "installment" },
    { "field": "value", "op": "gt", "value": 500000 }
  ], "sort": { "field": "plot_no", "dir": "asc" } }

// عملاء من نوع مشتري بجوال يبدأ بـ 055
{ "entity": "clients", "filters": [
    { "field": "type", "op": "eq", "value": "buyer" },
    { "field": "phone", "op": "starts_with", "value": "055" }
  ] }

// أقساط بنكية بين تاريخين
{ "entity": "plot_payments", "filters": [
    { "field": "method", "op": "eq", "value": "bank" },
    { "field": "pay_date", "op": "between", "value": "2025-01-01", "value2": "2025-12-31" }
  ], "sort": { "field": "pay_date", "dir": "desc" } }
```

---

## 4) أداة `create` — الحقول المطلوبة لكل كيان

| الكيان | المطلوب | اختياري مهم |
|---|---|---|
| `properties` | `name` | description, price, area, address, status, type, owner_name, owner_phone |
| `clients` | `name` | phone, email, type, notes, budget_min, budget_max |
| `offers` | `property_id`, `client_id` | type, amount, status, date, notes |
| `campaigns` | `name` | description, type, status, budget, start_date, end_date |
| `viewings` | `property_id`, `client_id` | date_time, status, notes |
| `waypoints` | `name`, `latitude`, `longitude` | description, type, category, price, owner_* |
| `areas` | `name`, `geojson` | description, area_sqm, perimeter_m, category |
| `projects` | `name` | description |
| `blocks` | `project_id`, `name` | plot_count (يُنشئ خانات تلقائياً), notes |
| `plots` | `block_id` | plot_no, area_sqm, status, boundaries, value, buyer_*, sale_date, installment_type, paid_amount, remaining_amount |
| `plot_payments` | `plot_id`, `amount` | pay_date, method (cash/bank), cash_recipient, cash_receipt_no, bank_name, bank_ref_no |
| `custom_fields` | `entity_type`, `label` | value_type, options |
| `custom_field_values` | `entity_id`, `field_id`, `value` | entity_type |

**قيم الحالات (enums):**
- plots.status: `available` (متاحة) | `sold` (مبيعة) | `installment` (قيد التقسيط)
- plots.installment_type: `monthly` | `quarterly` | `semi_annual` | `annual`
- plot_payments.method: `cash` (كاش) | `bank` (بنكي)
- properties.status: `for_sale` | `pending` | `rented` | `sold` — properties.type: `apartment` | `villa` | `land` | `office` | `commercial`
- clients.type: `buyer` | `seller` | `both`
- offers.type: `buy_offer` | `sell_offer` — offers.status: `pending` | `accepted` | `rejected` | `countered`
- campaigns.type: `social_media` | `email` | `sms` | `brochure` — status: `draft` | `active` | `completed`
- viewings.status: `scheduled` | `completed` | `cancelled`
- custom_fields.entity_type: `project` | `block` | `plot` — value_type: `text` | `number` | `date` | `boolean` | `select`

**مثال إضافة قسط:**
```json
{ "entity": "plot_payments", "data": {
    "plot_id": "PLOT_ID", "amount": 60000, "pay_date": "2025-06-01",
    "method": "cash", "cash_recipient": "خالد العتيبي", "cash_receipt_no": "SND-0100"
} }
```
> إضافة قسط **تحدّث تلقائياً** عمودي `paid_amount` و `remaining_amount` وحالة القطعة (عبر `recordPayment`).

**مثال تعديل حالة قطعة إلى مبيعة:**
```json
{ "entity": "plots", "id": "PLOT_ID", "data": {
    "status": "sold", "buyer_name": "محمد الراشد",
    "buyer_contact": "0551112233", "sale_date": "2026-01-10"
} }
```

---

## 5) الأدوات التحليلية — معادلات بين الجداول

### `project_tree`
```
{ "project_id": "..." }
```
يعيد: `{ project, blocks: [{...بلوك, plots: [{...قطعة, payments: [أقساطها], custom_values: {...}}]}], totals }`
الإحصائيات: عدد البلوكات/القطع، توزيع الحالات (متاحة/مبيعة/قيد التقسيط)، مجاميع القيمة والمدفوع والمتبقي، `difference_column_vs_payments` (الفرق بين عمود المدفوع ومجموع الأقساط المسجلة فعلاً — يكشف أخطاء الإدخال).

### `project_financials`
```
{ "project_id": "..." }
```
جدول لكل قطعة + `aggregates` مع نسب التحصيل:
- `collection_rate_pct` = (مجموع الأقساط الفعلية / قيمة المشروع) × 100
- `rem_collection_rate_pct` = (عمود المدفوع / القيمة) × 100

### `installment_schedule`
```
{ "plot_id": "..." }
```
يعيد: مبلغ الدفعة التالية، عدد الدفعات السنوية حسب النوع، تقدير الدفعات المنفذة، وجدولة شهرية تفصيلية.

### `buyer_summary`
```
{ "buyer_query": "خالد" }   // اختياري
```
ملخص لكل مشتري: عدد القطع، إجمالي القيمة، المدفوع، المتبقي + قائمة القطع بأسمائها ومشاريعها — مرتبة بالأكثر متبقياً.

### `payment_ledger`
```
{ "project_id": "...", "method": "bank", "from_date": "2025-01-01", "to_date": "2025-12-31", "limit": 500 }
```
دفتر أقساط مفصّل: كل دفعة + رقم القطعة + البلوك + المشروع + حالة القطعة + وسيلة الدفع.

### `dashboard_kpis`
عدّادات كل الكيانات + إجمالي قيمة القطع، المدفوع، المتبقي، ومجموع الأقساط.

---

## 6) الحقول المخصصة (EAV)

المشاريع/البلوكات/القطع تدعم حقولاً مرنة تُضاف من داخل التطبيق دون تغيير السكيمة:
- أنشئ الحقل: `create` على `custom_fields` بـ `{entity_type:"plot", label:"ملاحظات إدارية", value_type:"text"}`
- قيّم كياناً: `custom_field_set` بـ `{entity_type:"plot", entity_id:"...", field_id:"...", value:"..."}`
- عند `query` على plots/blocks/projects ستجد المفتاح `custom_values: {label: value}` في كل صف.
- يمكن الفلترة على القيم المخصصة بعد الجلب (بلا فلتر SQL مباشر).

---

## 7) سيناريوهات نموذجية (سلوك متوقع)

| طلب المستخدم | تسلسل الأدوات |
|---|---|
| "كم قطعة متاحة في الواحة؟" | `query` plots → filter `{block_id أو project_id}` + `{status:"available"}` ثم عدّ |
| "كم بقي لخالد؟" | `buyer_summary` بـ `{buyer_query:"خالد"}` |
| "سجّل قسط 60 ألف لقطعة 6" | `query` plots plot_no contains "قطعة 6" → `create` plot_payments → `get` القطعة للتأكيد |
| "أين الفرق في مدفوعات الواحة؟" | `project_financials` → الصفوف ذات `difference != 0` |
| "أرِني كل مبيع الواحة مع الأقساط" | `project_tree` → فلترة الحالة sold |
| "احسب جدولة متبقي قطعة 9" | `installment_schedule` plot_id |
| "أضف حقلاً مخصصاً 'رقم العقد' للقطع ثم املأه" | `create` custom_fields ثم `custom_field_set` لكل قطعة |
| "صنّف الأقساط بنكية مقابل كاش في الشهر الماضي" | `payment_ledger` `{from_date, to_date}` ثم تجميع يدوي حسب `method` |

---

## 8) قواعد سلوكية للوكيل

1. **تحقق قبل الكتابة**: قبل `update`/`delete` نفّذ `get` أو `query` للتأكد من وجود السجل ومعرفاته.
2. **المعرفات أولاً**: إن طلب المستخدم "قطعة 6" ابحث بها (`query` + `starts_with`/`contains`) ثم استخدم `plot_id` الحقيقي في كل العمليات.
3. **الكتابة إجرائية**: اعرض ما ستفعله، نفّذ، ثم أعد قراءة للتأكيد وأبلغ النتيجة بوضوح.
4. **العملة**: اعرض الأرقام المالية بصيغة الريال اليمني (ر.ي) مع تنسيف آلاف.
5. **لا تحذف بلا تأكيد**: حذف مشروع/بلوك/قطعة حذف سلسلة — اطلب تأكيد المستخدم أولاً.
6. **الفرق المحاسبي**: عند ظهور `difference` في `project_financials` أشر إليه للمستخدم — قد يعني قسطاً مَسُجَّلاً في عمود المدفوع بدون سجل فعلي.
7. **إذا لم تعرف شيئاً**: نفّذ `list_entities` أولاً للاطلاع على الحقول والقيم المتاحة.
8. **لا تلمس**: ملفات التطبيق، السكيمة، أو الجداول غير المذكورة هنا.

---

## 9) الاستدعاء من داخل الكود (للمطور)

```ts
import { executeTool, toolNames, TOOLS } from '../src/agent'
const res = await executeTool('query', { entity: 'plots', filters: [{ field: 'status', op: 'eq', value: 'installment' }] })
if (res.ok) console.log(res.result.total)
else console.error(res.error)
```
- `executeTool(name, args)` → `{ ok: true, result } | { ok: false, error }` — كل الأدوات تُرجع بيانات JSON قابلة للتسلسل (جاهزة لأي bridge مستقبلاً).
- `TOOLS` مصفوفة تعريفات الأدوات (الاسم، الوصف، الحجج) — يمكن تمريرها لأي وكيل كعقود أدوات (tool contracts).
