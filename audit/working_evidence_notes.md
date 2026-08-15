# ملاحظات تدقيق property-manager-app — أدلة مؤكدة

تاريخ الفحص: 2026-08-15/16 بتوقيت البيئة. المستودع: `adibadm409-eng/property-manager-app`, الفرع `main`, HEAD `7ec5dca`.

## خط الأساس

- تطبيق Expo/React Native/TypeScript يعمل محلياً فوق SQLite (`realestate.db`)، بلا طبقة خادم أو حسابات أو مزامنة متعددة الأجهزة ظاهرة في الشجرة.
- `npm ci --ignore-scripts` نجح.
- `node node_modules/typescript/bin/tsc --noEmit` نجح بخروج 0.
- لا يوجد test/lint/e2e script في `package.json` ولا ملفات اختبارات مكتشفة.
- `npm audit --omit=dev` أعاد 26 ثغرة: 16 عالية و10 متوسطة، 0 حرجة؛ منها حزم مباشرة/شبه مباشرة مرتبطة بـ Expo/Metro و`exceljs` وmarkdown stack.
- GitHub Actions ينجح في بناء APK موقّع، لكنه لا يشغل اختبارات أو فحص جودة قبل البناء. آخر تشغيل ظاهر ناجح على `7ec5dca`، مع تشغيلين فاشلين سابقين.

## P0/P1 مؤكدة

### R-01 — عدم وجود معاملات/صلاحيات على مستوى التطبيق
الأثر: التطبيق لا يملك هوية مستخدم أو RBAC أو مزامنة أو سجل مركزي؛ كل بيانات الأعمال والمفاتيح محلية. هذا يمنع التشغيل الإنتاجي كمنتج فريق/خدمة SaaS، ويجعل فقدان الجهاز/الملف/النسخة الاحتياطية نقطة فقدان كلي.
الأدلة: `memory/ARCHITECTURE.md:5-21`, `src/database/db.ts:5-13`, `package.json` لا يحتوي backend/auth/sync.
الثقة: مؤكدة من بنية المستودع؛ القرار التجاري (هل المطلوب single-user offline أم multi-user) يحتاج تثبيتاً.

### R-02 — مفاتيح LLM محفوظة بنص JSON في SQLite
الأثر: أي استخراج لملف قاعدة البيانات أو نسخة غير مشفرة أو جهاز مخترق يكشف مفاتيح المزودين. `activeConfig` يعيد المفتاح مباشرة للاستخدام، ونسخة SQLite تحوي `agent_settings`.
الأدلة: `src/assistant/store.ts:74-99,121-198`; `src/database/backup.ts:8-14,162-227`.
الثقة: مؤكدة.

### R-03 — مفاتيح الخرائط محفوظة بنص JSON ويُعرض الإدخال كنص عادي ويحفظ أثناء الكتابة
الأثر: تسريب بصري/محلي، وادعاء الشاشة بأن السر لا يرسل لخادم لا يعالج غياب تشفير الجهاز أو النسخ الاحتياطي.
الأدلة: `src/screens/MapScreenV2/mapProviders.ts:174-210`; `src/screens/map/MapKeysSettings.tsx:38-42,61-88`.
الثقة: مؤكدة.

### R-04 — استعادة النسخة الاحتياطية عملية تدميرية واسعة بحاجز UX ضعيف
الأثر: `restoreFullBackup` يفك الملف ثم يحذف كل الكائنات والجداول ويعيد إنشاءها داخل معاملة، ثم يكتب الملفات، من دون إنشاء snapshot تلقائي للحالة الحالية، ولا تحقق schema/compatibility قوي، ولا خطوة تأكيد ثانية/كتابة عبارة. خطأ أثناء كتابة الملفات بعد نجاح المعاملة يترك الاستعادة جزئية. الملف غير المشفر ممكن عند عدم وجود مفاتيح/عند إيقافها.
الأدلة: `src/database/backup.ts:280-290,313-376`; `src/screens/BackupManager.tsx:93-102,223-264`.
الثقة: مؤكدة.

### R-05 — خلل مؤكد في duplicateWorkspace
`duplicateWorkspace` ينشئ `newId` لكنه يستدعي `duplicateTable(t.id, t.name)`؛ `duplicateTable` يشتق `workspace_id` من الجدول الأصلي، ولا يستقبل `newId`. النتيجة: الجداول والصفوف لا تنتقل إلى المساحة الجديدة؛ وقد يعيد createTable جدولاً قائماً بالاسم في المساحة القديمة. يعود API بعدد الجداول رغم أن النسخة الجديدة فارغة.
الأدلة: `src/database/workspace.ts:613-635`.
الثقة: مؤكدة بالقراءة الساكنة.

### R-06 — استيراد الخرائط يضيف سجلات واحداً واحداً بلا كشف تكرار أو rollback
الواجهة تقول صراحةً إن الاستيراد «يضيف العناصر دون تكرار»، لكن `doImport` يستدعي `createWaypoint/createArea` في حلقة بلا مطابقة أو transaction؛ الانقطاع بعد عدة عناصر يترك استيراداً جزئياً، وإعادة الملف تنشئ نسخاً مكررة.
الأدلة: `src/screens/Tools.tsx:51-78,148-155`.
الثقة: مؤكدة.

### R-07 — بيانات مالية بلا قيود سلامة كافية
`recordPayment` يقبل مبلغاً غير موجب/يتجاوز المتبقي، يخفض `remaining_amount` بلا سقف، يرفع `paid_amount` بلا reconciliation مع مجموع `plot_payments`, يغيّر الحالة من available إلى installment فقط، ولا يحول القطعة المدفوعة بالكامل إلى sold. `deletePayment` يعكس الأرقام لكنه لا يعيد الحالة من installment عند إزالة آخر دفعة.
الأدلة: `src/database/projects.ts:573-614`; schema `134-144` و`114-132` بلا CHECK/UNIQUE/FK ظاهرة.
الثقة: مؤكدة.

### R-08 — عمليات الإنشاء المركبة ليست ذرية
إنشاء block ثم slots/plots يتم عبر حلقات خارج transaction؛ `agentCreate(blocks)` قد ينشئ البلوك وبعض القطع ثم يفشل. استيراد Excel ينشئ workspace والجداول والصفوف على مراحل، والاستثناء لا ينظف workspace في مسار Excel.
الأدلة: `src/database/projects.ts:419-435`; `src/agent/crud.ts:180-197`; `src/database/workspace.ts:784-849`.
الثقة: مؤكدة.

### R-09 — سقف الوكيل 120 جولة مع عدم إيقاف التكرار وعدم وجود ميزانية/حد تكلفة
`MAX_TOOL_ROUNDS=120`، والتكرار يضيف ملاحظة فقط ويترك القرار للوكيل. يمكن لمهمة واحدة تنفيذ عشرات/مئات الاستدعاءات؛ مع 5 محاولات API وتأخيرات 3/5/10/30 ثانية، لا يوجد spend cap أو token budget أو per-tool quota.
الأدلة: `src/assistant/constants.ts:1-8`; `src/assistant/executor.ts:58-64,145-164,197-205`; `src/assistant/llm.ts:282-439`.
الثقة: مؤكدة.

### R-10 — محلل SSE يفقد الأحداث عند حدود chunks
`splitSse` يقسم كل `chunk` منفرداً على `\\n` ولا يحتفظ بباقي السطر/الحدث بين قراءتين. JSON/SSE الذي يصل مجزأً يُرفض بصمت في `JSON.parse` ويضيع delta أو tool call؛ هذا ينتج ردوداً ناقصة أو أداة غير مكتملة.
الأدلة: `src/assistant/llm.ts:121-127,203-216`.
الثقة: مؤكدة من البروتوكول والتنفيذ.

### R-11 — fallback من stream إلى non-stream بعد استهلاك جزئي
عند أي فشل في بث stream قبل نهاية الاستجابة، `chatWithRetry` يرسل طلب `postChat` جديداً لنفس الدور إذا لم يكن controller aborted. هذا قد يكرر تكلفة الطلب، ويعرض ردّاً جزئياً ثم كاملاً، وقد يتصرف بشكل مضلل في مزودات تعتمد على حالة/تتطلب عدم التكرار.
الأدلة: `src/assistant/llm.ts:412-421`.
الثقة: عالية.

### R-12 — الوكيل يرسل بيانات أعمال حساسة إلى مزود خارجي/عنوان مخصص بلا طبقة تنقيح أو موافقة خصوصية
سياق الجلسة ونتائج أدواته ومحتوى العملاء/المشترين/الأقساط يمكن أن يدخل الرسائل، والاتصال يتم مباشرة من الجهاز إلى `baseUrl` مع `Authorization`، بما في ذلك المزود المخصص الذي يختاره المستخدم. لا توجد redaction، classification، policy، أو audit لحدود البيانات المرسلة.
الأدلة: `src/assistant/executor.ts:55-78`; `src/assistant/llm.ts:140-168,296-324`; `src/assistant/store.ts:165-198`.
الثقة: مؤكدة كمسار بيانات؛ تقييم قانوني/سياسة خصوصية يحتاج متطلبات المنتج.

## P1/P2 إضافية

### R-13 — تحديثات عامة قد تعلن نجاحاً لسجل غير موجود
`updateProperty/updateClient/...` تنفذ UPDATE بلا التحقق من `changes` أو وجود id، ثم تسجل change log وتعيد نجاحاً. `dbGenericUpdate` كذلك. `verifyDataExists` قد لا يغطي كل update paths أو لا يمنع الإعلان؛ الواجهة CRUD لا تُظهر طبقة تحقق موحدة.
الأدلة: `src/database/db.ts:293-300,332-339`; `src/agent/crud.ts:369-381`.

### R-14 — التراجع ليس استعادة exact state
Undo للحذف يعيد سجلاً بمعرف جديد، ولا يستعيد العلاقات التابعة تلقائياً؛ undo لمساحة/جدول يعيد بمعرف جديد وقد يغيّر الروابط. `performUndo` يصرح بذلك في الرد.
الأدلة: `src/assistant/undo.ts:120-214`.

### R-15 — التراجع destructive بلا تحقق من تعارضات ما بعد العملية
undo update يستبدل البيانات السابقة حتى لو عدّل المستخدم السجل بعد العملية؛ لا version/compare-and-swap، ولا transaction شاملة عبر كيانات/قيم مخصصة، وقد يحذف/يستعيد على حالة تغيّرت.
الأدلة: `src/assistant/store.ts:348-387`; `src/assistant/undo.ts:194-204`.

### R-16 — سجل التدقيق ليس ضماناً تدقيقياً
`logChange` يبتلع كل استثناء ويرجع null كي لا يكسر العملية. السجل قابل للمسح كلياً، ولا يوجد hash chain/immutable storage/retention أو فصل صلاحيات. كما أن `before/after` قد يحتوي أسراراً وبيانات شخصية.
الأدلة: `src/database/audit.ts:133-170,223-231`; `src/database/db.ts:164-179`.

### R-17 — الحذف العام في Settings لا يشمل النظام كله
زر «حذف جميع البيانات» يمسح viewings/offers/campaigns/clients/properties فقط؛ لا يمسح المشاريع، الأقساط، المساحات، جلسات كيمو، المرفقات، الملفات المولدة، مفاتيح LLM، الإعدادات أو change_log. الاسم والنتيجة مضللان.
الأدلة: `src/screens/Settings.tsx:51-71`.

### R-18 — schema/foreign-key/قيود uniqueness ضعيفة
جداول projects/blocks/plots/payments/custom values لا تُظهر FK/ON DELETE أو CHECK/UNIQUE في إنشاء الجداول؛ الاعتماد على `purgeOrphanedData()` عند الإقلاع يعني السماح ببيانات يتيمة حتى الإقلاع، وقد يكون cleanup destructive.
الأدلة: `src/database/projects.ts:99-162,176-203`.

### R-19 — duplicate/identity keys معتمدة على Date.now+Math.random
توليد IDs في db/projects/workspace/store يعتمد على وقت + Math.random ولا يضمن uniqueness cryptographically؛ لا توجد مفاتيح أعمال/unique constraints لـ plot_no داخل block، names، أو custom field values. توجد race conditions بين فحص التكرار ثم الإدراج.
الأدلة: `src/database/db.ts:191-193`; `src/database/projects.ts:327-329`; `src/database/workspace.ts:107-109,437-457`.

### R-20 — استيراد الملفات غير مشروط بالحجم/الذاكرة/نوع MIME
`filePreview`/`importProjectFile` يقرأ الملف كاملاً base64 في الذاكرة ويحوّل Excel عبر `exceljs`; السقف 8000 صف لكل ورقة لكنه ليس سقف حجم ملف/عدد أوراق/عدد أعمدة/وقت، وCSV يفترض UTF-8/فواصل بسيطة. النسخة الاحتياطية لديها cap لكن تتخطى الملفات بصمت.
الأدلة: `src/database/workspace.ts:694-734,784-849`; `src/database/backup.ts:127-157`.

### R-21 — مطابقة المرفقات بالاسم فقط وبـ fallback contains
`findAttachment` يختار أول اسم مطابق/ينتهي/يحتوي، من قائمة آخر 100 مرفق كل الجلسات، دون session ownership أو unique name؛ قد يقرأ/يحذف ملف جلسة أخرى عند تشابه الاسم.
الأدلة: `src/database/workspace.ts:648-675,851-860`.

### R-22 — نسخ Workspace والعمليات الدفعة غير ذرية
`createFullTable`, `duplicateTable`, `duplicateWorkspace`, `workspace_create` تنفذ خطوات متتابعة؛ الفشل يترك جداول/مساحات جزئية. `workspace_add_columns` و`setColumnMeta` تعدل metadata ثم الصفوف بلا transaction.
الأدلة: `src/database/workspace.ts:353-403,597-635`; `src/agent/registry.ts:358-379,533-562`.

### R-23 — استيراد/تصدير GIS فقد دقة وصحة البيانات
المحول يدعم Point/Polygon وFeatureCollection فقط؛ KML/GPX عبر regex غير namespace-aware، وGPX track يتحول إلى Polygon دون إغلاق الحلقة، وGPX export يعامل كل area كـ track. لا يوجد تحقق range/geometry validity، ولا dedupe، وتُفقد metadata العقار المالية في التصدير.
الأدلة: `src/screens/map/io.ts:24-57,74-143`; `src/screens/Tools.tsx:17-27,51-78`.

### R-24 — تبعية الخرائط الخارجية واسعة وغير مضمونة
WebView يفتح اتصالات `https:` لأي مصدر في CSP ويعتمد على مزودين عامين متعددين بلا backend/proxy موحد، مع Vector style من الإنترنت، وكاش IndexedDB/ذاكرة محدود 1000 بلا قياس حجم. لا توجد سياسة versioning/availability/attribution موحدة أو retry/backoff للصور.
الأدلة: `src/screens/MapScreenV2/vector/enginePage.ts:13-73,147-279,469-487,506-523`; `src/screens/MapScreenV2/mapProviders.ts:189-210`.

### R-25 — WebView يثق في رسائل window دون origin/message authentication
المحرك يعالج `message` وJSON commands `init/fly/render/setOnline/overlay` مباشرة، ويعتمد على `originWhitelist=['*']` في الجسر RN (وفق `VectorEngine.tsx`)، مع `javaScriptEnabled` و`domStorageEnabled`. المخاطر تعتمد على ضمان أن الصفحة لا تُستبدل/لا تُحقن؛ لا يوجد nonce/sequence binding/authentication للرسائل.
الأدلة: `src/screens/MapScreenV2/vector/enginePage.ts:563-606`; `src/screens/MapScreenV2/vector/VectorEngine.tsx:224-239`.

### R-26 — CSP تتضمن unsafe-inline وconnect/img لأي HTTPS
هذا يقلل قيمة CSP إذا دخل HTML/JS غير موثوق من مسار آخر، ويعطي سطح اتصال واسع لمصادر غير محددة. ليس ثغرة منفردة لأن الصفحة local static، لكنه ضعف دفاعي.
الأدلة: `enginePage.ts:63-73,81-88`.

### R-27 — جودة UX لا تطابق DESIGN source of truth
الوثيقة تمنع الألوان الصلبة داخل الشاشات، لكن grep وجد عشرات/مئات usages للـ hex داخل screens/map cards؛ توجد ألوان ورسوم ثابتة متكررة خارج tokens، وdark mode لا يمكن الاعتماد عليه في أجزاء الخريطة/cards (ألوان بيضاء/سوداء ثابتة).
الأدلة: `DESIGN.md:23-26,47-67,164-173`; `src/screens/MapScreenV2/cards/*.tsx`; `/tmp/property_hex.txt`.

### R-28 — وصولية/اختبار واجهة ضعيفان
لا توجد ملفات testID/accessibilityLabel/accessibilityRole في نتائج البحث تقريباً، والاعتماد على icon + color؛ لا توجد اختبارات e2e أو snapshot أو device matrix. هذا يعرض RTL، حجم الخط، قارئات الشاشة، والرسوم للإخفاق غير المرئي.
الأدلة: grep accessibility في `src`; غياب test/lint scripts في `package.json`.

### R-29 — إعدادات الثيم لا تستمر
`ThemeContext` يعتمد على `Appearance.getColorScheme()` وذاكرة runtime فقط؛ اختيار المستخدم لا يُحفظ بعد إعادة التشغيل.
الأدلة: `src/theme/ThemeContext.tsx:15-24`.

### R-30 — أذونات زائدة/إفصاحات غير متسقة
`app.json` يطلب `ACCESS_BACKGROUND_LOCATION` وCAMERA، بينما البحث في الكود يظهر foreground location فقط وPropertyForm؛ أذونات Android مكررة، نصوص iOS إنجليزية، ودافع الكاميرا يقول مسح وثائق بينما الاستخدام الفعلي يحتاج مراجعة. هذا يزيد سطح الخصوصية واحتكاك القبول.
الأدلة: `app.json:11-35`; `PropertyForm.tsx:185-194`.

## ملاحظات جودة البناء

- GitHub workflow يحقق توقيع APK ويخزن secrets في gradle.properties أثناء CI؛ لا توجد اختبارات/فحص تكرار/فحص dependency policy قبل artifact.
- `postinstall.sh` يرقع node_modules، ما يجعل البناء حساساً لتغير بنية Metro ويحتاج اختباراً بعد كل تحديث.
- private repo ونجاح البناء لا يساويان جاهزية إنتاجية: لا release channel/store distribution، لا crash reporting، لا metrics، لا backup scheduling، لا remote recovery.

## عناصر تحتاج تحققاً تجريبياً لاحقاً

- تشغيل Expo على جهاز/محاكي لاختبار fallback الخريطة، الضغط/الرسم، استعادة النسخة، ومنافسة الكتابة.
- اختبار SSE بتقطيع فعلي للـ chunks لإثبات R-10 runtime.
- اختبار duplicateWorkspace على SQLite فعلي لإثبات الناتج النهائي للنسخة.
- فحص كل provider live لأن كتالوج models/version names قد يكون قديماً أو غير صالح.
- مراجعة package audit مع `npm audit fix --dry-run` وتثبيت مصدر كل ثغرة وما إذا كانت production bundle أو build-only.

### R-31 — التقارير المرئية محدودة وليست طبقة BI إنتاجية
`Reports.tsx` يقتصر على أربع بطاقات أرقام وشريطين حسب النوع/الحالة وقيمة إجمالية وحملات نشطة؛ لا توجد محاور زمنية، فلاتر، drill-down، مقارنة، export منظم، تعريف freshness، أو حالة خطأ قابلة لإعادة المحاولة. `projects/ReportsScreen.tsx` يعرض قوائم القطع وبطاقات إحصائية ونص مشاركة؛ لا PDF/XLSX/CSV ولا رسوم مالية/تحصيل زمنية، ويجري `Promise.all` لتقرير كل مشروع بلا pagination/caching.
الأدلة: `src/screens/Reports.tsx:27-50,80-132`; `src/screens/projects/ReportsScreen.tsx:56-67,75-103,203-253`.

### R-32 — افتراض العملة اليمنية ثابت في الكتالوج والتقارير
الكود والـ prompts يثبتان «ريال يمني»، بينما `formatPrice` يستخدم `Intl.NumberFormat('ar-SA')`؛ لا يوجد setting أو currency field. هذا يسبب لبساً عند التوسع أو إدخال بيانات بعملة مختلفة، ويضعف التقارير المالية.
الأدلة: `src/assistant/prompts.ts:49,138-140`; `src/agent/catalog.ts:112,160,182,306,311,330`; شاشات Reports/Properties/Offers.

### R-33 — بعض التأكيدات تمنح وضع التعديل صلاحية واسعة في ضغطة واحدة
واجهة كيمو توفر toggle مباشر بين القراءة والتعديل، والوصف يقول إن الحذف يتطلب موافقة، لكن الإنشاء/التعديل وعمليات الاستيراد/توليد الملفات يمكن تنفيذها فوراً ضمن الوضع. لا توجد per-action policy، preview/diff موحد، أو timeout/lock للموافقة على جلسة كاملة.
الأدلة: `src/screens/assistant/AssistantScreen.tsx:323-327,726-736`; `AgentSettings.tsx:162-167,345-360`; `src/assistant/prompts.ts` و`registry.ts`.

### R-34 — اختبار الاتصال يعيد المحاولة عدة مرات ولا يوضح الكلفة أو سياسة الخصوصية
`testConnection` يمر عبر `chatWithRetry` ويستخدم حتى 5 محاولات، فيمكن لفحص واحد أن يكرر طلباً مدفوعاً. لا توجد طبقة rate limit/usage budget/consent قبل إرسال بيانات الجلسة، رغم أن اختبار الاتصال نفسه ثابت وقليل المحتوى.
الأدلة: `src/assistant/llm.ts:452-490,282-439`; `AgentSettings.tsx:134-160`.

### R-35 — إعداد المزود المخصص يفعّل المزود فور الحفظ دون تحقق HTTPS/allowlist
`CustomProviderEditor` يقبل أي base URL نصي، يختبر endpoint ثم يحفظه ويجعله `activeProvider` مباشرة. يوجد دعم مقصود للخوادم المحلية/البوابات، لذلك هذه ليست ثغرة وحدها، لكنها ترفع خطر exfiltration/SSRF-like user mistake إذا استُخدم رابط غير موثوق ولا توجد تحذيرات واضحة أو allowlist.
الأدلة: `src/screens/assistant/CustomProviderEditor.tsx:58-86,88-110,162-166`.

### R-36 — تحديث إعدادات المزود يحفظ المفتاح أثناء كل ضغطة
`AgentSettings.tsx` يستدعي `save` داخل `onChangeText` للمفتاح، وMapKeysSettings يفعل الشيء نفسه. هذا يزيد عمليات الكتابة ويفاقم بقاء الأسرار في سجل SQLite/نسخ احتياطية، مع عدم وجود debounce أو زر حفظ/إلغاء.
الأدلة: `AgentSettings.tsx:271-290`; `MapKeysSettings.tsx:38-42,80-88`.

### R-37 — اعتماد runtime على patch داخلي لـ Metro
`postinstall.sh` يحرر `node_modules/metro/src/DeltaBundler/WorkerFarm.js` ويستبدل شرط maxWorkers بـ `if (false)` لإجبار in-process worker. هذا يحل عارض EPIPE محلياً لكنه يخفي مشكلة في البيئة، يضعف reproducibility، وقد يفشل عند تغير مسار/محتوى Metro.
الأدلة: `postinstall.sh:2-10`.

### R-38 — CI يبني APK موقّعاً فقط ولا يثبت جودة المنتج
workflow يشغل npm ci، prebuild، patch signing، Gradle assembleRelease، وفحص signature؛ لا test/lint/typecheck/audit gate، ولا smoke test على جهاز/محاكي، ولا نشر staged/rollback/crash analytics. نجاح آخر run لا يثبت سلوك التطبيق.
الأدلة: `.github/workflows/build-apk.yml`؛ `package.json` scripts.

### R-39 — أذونات التطبيق أوسع من الاستخدام المرصود
`app.json` يطلب background location وcamera، بينما الكود المرصود يطلب foreground location فقط. نصوص iOS إنجليزية، ووصف الكاميرا لمسح الوثائق دون مسار موثق في الفحص الأساسي. يجب تقليل الأذونات أو إثبات الحاجة.
الأدلة: `app.json:11-35`; `src/screens/PropertyForm.tsx:185-194`.
