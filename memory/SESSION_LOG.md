# سجل الجلسات — Session Log

سجل ما أنجزناه في كل جلسة. يكتبه المساعد بعد كل مهمة.
التنسيق: التاريخ — الملخص — الملفات المتأثرة. الأحدث في الأعلى.

---

## 2026-08-24 — تجهيز التطبيق للبناء الكامل بمحرك كيمو المضمَّن (بلا خادم)
- **المُلخّص**: المستخدم أكّد: انسَ Expo Go/Termux، حضّر التطبيق للبناء الكامل حيث
  يعمل محرك كيمو البايثوني **مضمَّناً داخل التطبيق** ويشارك قاعدة التطبيق ذاتها
  (بلا خادم منفصل). أُغلقت فجوتان كانتا تمنع التوافق: (1) فجوة العرض — المحرك لم
  يكن يكتب المحادثة في جداول التطبيق فيظهر الجواب ثم يختفي عند إعادة التحميل؛
  (2) فجوة البيانات — المحرك كان يستخدم قاعدة `kimo.db` منفصلة عن
  `expo-sqlite`. الحل: `AppSessionStore` يكتب في `agent_messages`/`agent_sessions`
  بنفس مخطط `store.ts`، و`KIMO_DB_PATH` يوجّه المحرك لقاعدة التطبيق.
- **التعديلات**:
  1. `python-agent/kimo/loop.py`: وضع `client_mode` (يطلب الأدوات ويتوقف عبر
     `PauseForClient`، أو يستهلك `client_results`) لنمط الإيقاف/الاستئناف.
  2. `python-agent/kimo/engine.py`: أُضيف `run_round` (client_mode) و
     `last_assistant_text`؛ ربط `PauseForClient`.
  3. `python-agent/kimo/integration/app_session_store.py`: `add_message` يضمن
     وجود صف الجلسة (INSERT OR IGNORE في `agent_sessions`)؛ تسلسل `tool_calls`
     بأمان في `meta`.
  4. `python-agent/kimo/host.py` + `kimo_serve.py`: `build_agent` يربط
     `session_store`؛ `EngineHub` يستخدم `AppSessionStore` + `KIMO_DB_PATH`.
  5. `python-agent/kimo_embed.py` (جديد): نقطة دخول **مضمَّنة بلا خادم** —
     `run_chat_sync(session_id, text, db_path, mock)` يشغّل المحرك داخل المعالج
     ويكتب في قاعدة التطبيق ويعيد JSON (answer+events).
  6. `python-agent/property-app/src/assistant/kimoBridge.ts`: حفظ الجواب في
     قاعدة التطبيق (احتياط HTTP). `kimoNative.ts` (جديد): يستدعي الوحدة الأصلية
     `KimoEngine.runChat` إن وُجدت، وإلا يعود لـ HTTP. `executor.ts` وُجّه إلى
     `runViaKimoNative`.
  7. `python-agent/property-app/android/app/src/main/java/com/propertyapp/agent/KimoEngineModule.kt`
     (جديد): وحدة RN أصلية (Chaquopy) تستدعي `kimo_embed.run_chat_sync`.
  8. `python-agent/property-app/scripts/sync-kimo-python.mjs` (جديد): ينسخ `kimo/`
     و`kimo_embed.py` إلى `android/app/src/main/python/`.
  9. `python-agent/property-app/EMBEDDED_BUILD.md` (جديد): خطوات بناء أندرويد
     عبر Chaquopy + EAS، وiOS عبر PythonKit.
- **التحقق**: `examples/integration_build_test.py` (فجوة العرض + الإيقاف/الاستئناف)
  PASS؛ `kimo_embed.py` يعمل بلا خادم ويكتب `agent_messages`/`agent_sessions`؛
  `examples/integration_test.py` (12 فحص) ما زال PASS.
- **بقي**: بناء فعلي على EAS/Chaquopy غير مُختبر هنا (لا Android SDK)؛ الوحدة
  الأصلية و`EMBEDDED_BUILD.md` بحاجة لتشغيل بناء تجريبي للتأكيد. `my-app`
  الأصلي لم يُمَسَّ (كل التعديلات في `python-agent/property-app`).

---

## 2026-08-23 — تصحيح معمارية محرك كيمو البايثوني ليتطابق مع القديم
- **المُلخّص**: المستخدم أوضح أن المحرك الجديد يجب أن يعمل **بنفس طريقة المحرك القديم تماماً**،
  والفرق الوحيد السرعة/الكفاءة/القوة. لذلك أُلغيت تجزئة المعمارية (تطبيق يطلب المزوّدات +
  بايثون أدوات فقط) وعُدنا إلى محرك كامل: `kimo_serve.py` يفعل الحلقة + المزوّد + الأدوات
  كعقل كامل، وتطبيق إكسبو مجرد واجهة عميل (محادثة RTL + إعدادات).
- **التعديلات**:
  1. `python-agent/kimo_serve.py`: أُعيد إلى نسخة المحرك الكامل (EngineHub يحوي create_session
     + chat يستهلك send_user_message ويعيد answer+events)؛ نقاط /api/providers, /api/settings,
     /api/session, /api/chat، وشاشة محادثة ويب للتجربة.
  2. `python-agent/expo-app/`: App.js (عميل محادثة + مودال إعدادات)، ServerConfig.js
     (SERVER_URL بعنوان IP الشبكة المحلية)، index.js، babel.config.js، app.json، package.json.
- **التحقق**: 12 فحص تكامل ناجح؛ الخادم يردّ على providers/settings/chat سليمة.
- **قيد التشغيل**: `python3 kimo_serve.py` + تعديل SERVER_URL في expo-app + `npx expo start`.

---

## 2026-08-19 — تنظيف شامل + تحسين بناء أندرويد + نجاح البناء في CI
- **المُلخّص**: تنظيف التبعيات الميتة، إصلاح اسم حزمة خطوط Tajawal المعطوب (كان
  `@expo/google-fonts/tajawal` بخط مائل غير صالح في الـ scope → `@expo-google-fonts/tajawal`؛
  هذا كان يُفشل `npm ci` في CI دائماً)، إضافة plugin لتحسين بناء أندرويد (minifyEnabled +
  shrinkResources + abiFilters arm64-v8a/armeabi-v7a وحذف x86)، تشغيل توقيع APK وتحقق من
  توقيعه في سير العمل، وجعل `offerReminders.ts` آمناً من الانهيار (إشعارات محلية فقط).
- **التعديلات**:
  1. `package.json`: حذف `react-native-web`/`react-dom`/`pm2`؛ تصحيح اسم `@expo-google-fonts/tajawal`؛
     إبقاء `docx` (تصدير Word) و`@expo-google-fonts/tajawal` (خطوط App.tsx) بعد إزالتهما خطأً.
  2. `plugins/androidOptimize.js` (جديد) + `app.json`: حقن minify/shrink/abiFilters.
  3. `.github/workflows/build-apk.yml`: Android SDK + NDK + توقيع من الأسرار + تحقق digest.
  4. `src/notifications/offerReminders.ts`: `setNotificationHandler` في try/catch؛ جدولة
     آمنة بـ `return await Notifications.scheduleNotificationAsync(...)` ترجع المعرّف الحقيقي.
  5. `audit/false_progress_invariants.test.ts`: تحديث الفحص ليطابق `agentChatStore.ts`
     (لا `AssistantScreen.tsx`) بعد نقل منطق done.
  6. `audit/unified_reminder_target_invariants.mjs`: تحديث العلامة الحرفية إلى
     `return await Notifications.scheduleNotificationAsync` (مطابقة للكود الآمن).
- **التحقق**: tsc (0) + eslint (0) + سلسلة `test:invariants` كاملة تمر محلياً
  (node/vitest/tsx)؛ بناء GitHub Actions ناجح (RUN 32308962167، conclusion=success)
  مع رفع artifact موقّع `realestate-app-release` (~36MB).
- **ملاحظة**: إصلاح `unified_reminder_target` كان ضرورياً لأن تعديلي على offerReminders
  (إضافة await) كسر العلامة الحرفية للفحص — درس: أي تعديل على كود يُفحص حرفياً يجب
  مزامنته مع فحصه.

## 2026-08-19 — حسم جذر خطأ 400 الصوت وحلّه بالمسارات الموثّقة
- **المُلخّص**: باستخدام مفاتيح المستخدم (مخزّنة مؤقتاً خارج المستودع) ثبت عملياً
  أن جهاز المستخدم يسجّل m4a وأن **كلا المزوّدين يرفضان m4a في مسار chat** بـ 400:
  جيميني OpenAI-compat → «Invalid audio format "m4a" ... Valid formats are: [wav, mp3]»،
  ومسترال voxtral → «Failed to load audio file ... valid mp3 or wav». في المقابل
  يقبلهما كلا المزوّدين في **نقاط التفريغ الموثّقة**: مسترال
  `/v1/audio/transcriptions` مع `voxtral-mini-latest` (200 على mp3/m4a، والوثائق تعرض
  مثالاً يرفع m4a)، وجيميني `generateContent` النصية بـ inlineData (200 على m4a/mp3).
- **التعديلات**:
  1. `transcribe.ts`: نموذج تفريغ مسترال من `voxtral-small-latest` (غير صالح → 400)
     إلى `voxtral-mini-latest` الموثّق؛ واحتياطي نموذج جيميني من `gemini-2.5-flash`
     (مرفوض للمفاتيح الجديدة → 404) إلى `gemini-3.5-flash`.
  2. `executor.ts`: مسار صوتي هجين بسيط — إرسال مباشر لـ `input_audio` فقط للصيغ
     التي يثبت المزود قبولها في chat (جيميني/مسترال: wav+mp3؛ openai: قائمة
     whisper الشهيرة)، وإلا (m4a افتراضي الجهاز) تفريغ نصي عبر النقطة الموثّقة.
  3. `providers.ts`: `audioFormats` لموديل voxtral-small في chat → `['wav','mp3']`.
- **التحقق**: tsc (0 أخطاء) + eslint (0 تحذيرات) + فحوصات
  audio_input / agent_input_surface / provider_wire / provider_compatibility
  (154 pass, 197 blocked) / model_profile — كلها PASS.
- **بقي**: دفع الالتزامات وإعادة تشغيل البناء في GitHub Actions ومتابعته حتى النجاح.

## 2026-08-19 — تجهيز البناء في GitHub Actions وإصلاح فحوصات CI
- **المُلخّص**: الهدف صار البناء في GitHub Actions وليس Expo Go. أُجريت مراجعة
  شاملة جعلت كل خطوات `npm run check` و`npm run lint` و`npm run test:invariants`
  تمر محلياً (بعد `npm ci` بالأنواع الحقيقية)، ثم أصبحت مستعدة للدفع والتشغيل.
- **إصلاحات جذرية (تراجعات مسبقة كانت تكسر البناء)**:
  1. `agent_input_surface_invariants` يتطلب `initialContent =` في executor بينما
     الالتزام 5a1f922 حذف المسار الصوتي متعدد الوسائط. أعيد العقد: إسناد الحمولة
     النهائية لـ `initialContent`، ومع مسار صوتي مستقيم للمزوّدات الداعمة
     (`profile.supports.inputAudio` → `input_audio` بالـ base64 والـ format) والنص
     المحوّل للباقي، داخل `sendUserMessage`.
  2. `audio_input_invariants` يتطلب `expo-audio` في app.json → أضيف plugin
     `expo-audio`، ويُنشأ معه `expo-contacts` بعد فحص `offer_relationship` المتطلب له.
  3. `false_progress_invariants` يتطلب `noEvidenceRecoveryAttempts` → أُعيد
     الحارس الموثق في تعليق الكود (القراءة التي تطلب بيانات محلية لا تختم بنص
     النموذج وحده): عدّاد يتجاوز `MAX_NO_EVIDENCE_RECOVERIES=2` → فشل صريح،
     ودون ذلك يُعاد الطلب للوكيل بتوجيه `runtimeCorrection`.
  4. `unified_mutation_invariants` كان يعترض على وجود أدوات CRUD في سطح كل مهارة —
     افتراض قديم يُبطلها قرار تحرير الأدوات؛ عُدّل ليصرّح بوجود `mutate_record` فقط.
  5. `safe_edit_invariants` كان يشترط `skillAllowsTool` — عُدّل ليصرّح بغياب البوابة.
- **تحقق محلي**: `npm ci` حقيقي، ثم `tsc --noEmit` (0 أخطاء، حاجة heap 4GB محلياً)،
  `eslint src audit --max-warnings 0` (0 أخطاء)، وكامل فحوصات invariants (المجموعات
  الأربع vitest + جميع نصوص node/tsx) كلها PASS.
- **ملاحظات بيئية (لا تخص CI)**: أوامر `npx vitest`/`npx eslint`/`npx tsx` تفشل في
  Termux بسبب shebang `/usr/bin/env` وتثبيت tsx مؤقت بـ `--no-save`؛ في ubuntu تعمل.
- **الملفات**: `src/assistant/executor.ts`, `src/assistant/prompts.ts`,
  `src/assistant/invokeTools.ts`, `src/assistant/persist.ts`,
  `src/screens/assistant/AssistantScreen.tsx`, `app.json`,
  `audit/agent_input_surface_invariants.mjs`, `audit/audio_input_invariants.mjs`,
  `audit/unified_mutation_invariants.test.ts`, `audit/safe_edit_invariants.mjs`.
- **اكتمال البناء**: دُفع الفرع `production-hardening-local` (7074a98) وشُغّل
  `workflow_dispatch` يدوياً (حلقة REST مع تذبذب DNS محلي)؛ التشغيل 32247136114
  انتهى **success** بكل خطواته — typecheck، lint، invariant tests، prebuild،
  التوقيع، `Verify APK signature`، ورفع artifact. الرابط:
  https://github.com/adibadm409-eng/property-manager-app/actions/runs/32247136114

---

## 2026-08-16 — تنظيف التضخم والكود الميت والبيانات المولدة
- **المُلخّص**: إزالة كاش الخرائط المتتبع `.tilecache` (نحو 75MB/4840 ملفاً)، إضافته إلى `.gitignore`، وحذف الوحدات القديمة غير القابلة للوصول من مسار App الحالي، بما فيها حزمة Leaflet القديمة ومكونات map legacy غير المستخدمة. أزيلت أيضاً أصول Expo المكررة غير المرجعية والملف المؤقت `.tmp`.
- **الاعتمادات**: أزيل `expo-status-bar` لأنه لم يكن مستورداً أو مستخدماً. أبقيت `react-dom` و`react-native-web` و`react-native-screens` و`babel-preset-expo` و`pm2` لأنها مطلوبة للويب/React Navigation/البناء أو تشغيل Metro الموثق، وأبقيت حزم التقارير والخرائط لأنها ذات قيمة عملية.
- **قاعدة البيانات**: أزيل البذر التجريبي من التهيئة، وأضيف تنظيف ترقية للسجلات التجريبية القديمة المعروفة في قواعد أُنشئت بإصدارات سابقة، مع الحفاظ على المخطط والترحيلات وبدء القاعدة الجديدة فارغة.
- **التحقق**: شجرة الاستيراد لا تترك إلا ملف تعريف TypeScript غير مستورد مباشرة، وهو مطلوب للأنواع؛ نجح TypeScript وESLint واختبارات invariants وتجميع الويب بعد التنظيف. أضيف `cleanup_invariants.mjs` لمنع عودة التضخم المحذوف.
- **ملاحظة الحجم**: خفض التنظيف مساحة شجرة المشروع الحالية غير الشاملة لـ `node_modules` و`.git` من نحو 86MB تقريباً إلى نحو 11MB؛ يبقى تاريخ Git محتفظاً بالكاش القديم، ولا يُعاد كتابة التاريخ دون قرار صريح بسبب مخاطر force-push.

## 2026-08-16 — إضافة هوية العقار وأنواعه وفلاتره وربطها بكيمو
- **المُلخّص**: أضيفت صورة أيقونة اختيارية للعقار للعرض السريع، مع نسخها إلى `documentDirectory/property_icons/` كي لا تعتمد على cache المؤقت؛ وتظهر في قائمة العقارات وبطاقة التفاصيل.
- **الأنواع**: توسع `PropertyType` و`TYPE_LABELS` وكتالوج كيمو إلى بيت، فندق، عمارة، برج سكني، مزرعة، قطعة أرض، هناجر، ومحلات، مع إبقاء الأنواع السابقة للتوافق.
- **البيانات**: أضيفت `icon_uri` و`broker_name` و`broker_phone` إلى SQLite بترحيل آمن وفهرس الدلال، وإلى نماذج الإنشاء والتعديل والنسخ والاستعلام. الدلال محفوظ منفصلاً عن المالك.
- **الواجهة**: نموذج العقار يتيح اختيار/تغيير/إزالة الصورة وإدخال اسم ورقم الدلال. قائمة العقارات تعرض الصورة أو أيقونة النوع البديلة وتتيح فلترة الحالة والنوع والحد الأدنى/الأقصى للسعر وpresets جاهزة. تفاصيل العقار تعرض الصورة وبيانات الاتصال بالدلال. فلاتر الخريطة وبطاقات المشاركة تستخدم التسميات المركزية الجديدة.
- **كيمو**: أضيفت الحقول والأنواع إلى `src/agent/catalog.ts`، وسياسة صريحة في prompts وscreenCatalog تمنع خلط الدلال بالمالك أو اختراع URI، وتدعم البحث والتعديل والمعاينة عبر أدوات `query/create/update/preview_update`.
- **الجودة**: أضيف `audit/property_metadata_invariants.mjs` إلى `test:invariants`. نجحت جميع اختبارات invariants، TypeScript، ESLint، تجميع الويب، وفحص إعداد Expo.
- **الملفات المحورية**: `src/types/index.ts`, `src/database/db.ts`, `src/screens/PropertyForm.tsx`, `src/screens/Properties.tsx`, `src/screens/PropertyDetail.tsx`, `src/agent/catalog.ts`, `src/assistant/prompts.ts`, `src/agent/screenCatalog.ts`.

## 2026-08-16 — إغلاق hardening الإنتاج المحلي للتطبيق العقاري
- **المُلخّص**: استكمال تحويل التطبيق إلى نوته عقارية محلية إنتاجية على فرع `production-hardening-local`؛ شملت طبقة المجال لمشاريع الأراضي والمباني والأبراج، دفتر التدفقات النقدية والأقساط، استيراداً متعدد الأنماط مع معاينة وcommit ذري وكشف تكرار، وخريطة أدوات/شاشات ومهارات كيمو المرئية.
- **سلامة البيانات**: أصبحت تحديثات العقارات والعملاء والنقاط والمناطق patches جزئية، مع رفض المعرفات غير الموجودة والحقول الديناميكية غير المعروفة في التعديل العام. حواجز الحذف المالي تمنع حذف أصل له دفعات أو إعادة قطعة متاحة بعد الدفع، وسجل التدقيق يحتفظ بـ bodyHash للنسخ ويتحقق من سلامة الإصدار.
- **كيمو**: نُقلت الأسرار إلى SecureStore، وأضيفت دورة مرئية للوكيل مع خطط ومراحل وقرارات وملاحظات وتعافٍ. تم إصلاح undo ليحفظ before/after، يلتقط before قبل التنفيذ، يكشف التعارضات، ولا يزيل سجل التراجع إلا بعد نجاحه؛ الاستعادة التي تتطلب معرفاً جديداً تعلن ذلك صراحة.
- **الإعدادات والخصوصية**: زر حذف جميع البيانات أصبح ذرياً ويشمل الجداول الحديثة للمشاريع والمساحات وكيمو وسجل التدقيق؛ اختيار الثيم يستمر عبر AsyncStorage؛ أزيلت صلاحيات الموقع الخلفية وAlways مع إبقاء صلاحيات foreground والكاميرا المستخدمة فعلاً.
- **الواجهة**: أضيفت حالات تهيئة وخطأ ظاهرة في شاشة كيمو، labels/roles للعناصر الرئيسية، دعم أفضل لـ RTL والوضع الداكن، وربط شريط أدوات الخريطة بألوان الثيم الدلالية بدلاً من خلفيات صلبة.
- **الجودة**: أضيف ESLint flat config وأوامر `check` و`lint` و`test:invariants` إلى package.json، وسبق workflow بناء APK بهذه البوابات. نجح TypeScript وESLint واختبارات invariants الثمانية وتجميع الويب عبر Expo.
- **الملفات المحورية**: `src/domain/projectDomain.ts`, `src/agent/domainTools.ts`, `src/assistant/{agentContract,skills,runtimeEvents,executor,store,undo}.ts`, `src/database/{db,projects,audit,backup,workspace,spatialImport}.ts`, `src/screens/assistant/AssistantScreen.tsx`, `src/screens/Settings.tsx`, `.github/workflows/build-apk.yml`.

## 2026-08-11 — إضافة توقيع (مفتاح) التطبيق
- **المُلخّص**: وُلّد مفتاح توقيع أندرويد رسمي عبر keytool (جافا 17) في
  `keystore/realestate-app.keystore` (الاسم المستعار `realestate`، صلاحية 10000 يوم،
  RSA 2048، SHA-256: F3:04:9A...C2:A4)، وربط بـ `credentials.json` لبناء EAS المحلي.
- **الأمان**: `keystore/` و `credentials.json` مستثناة من الجيت نهائياً؛ ملاحظة
  تحتوي كلمة السر محفوظة محلياً في `keystore/README.txt` (خارج الجيت). كلمة السر
  لا تُكتب في الذاكرة.
- **ملاحظات**: أي تحديث مستقبلي يجب أن يُوقَّع بنفس المفتاح؛ نُصّب `openjdk-17`
  ليتوفر keytool. الحزمة: `com.realestate.app`.

## 2026-08-11 — قرار: لا تحديث لـ opencode حالياً
- **القرار المثبّت**: المستخدم يرفض تحديث opencode (1.14.50) — يعمل بسلاسة في Termux
  بعد عناء سابق، ويخشى كسره. لا تحديث دون موافقته الصريحة.
- **خطة مستقبلية**: نسخة احتياطية كاملة أولاً ثم التحديث والاستعادة عند أي كسر.
- **البديل الحالي**: الحل اليدوي لإنشاء المستودعات يعمل تماماً — لا حاجة ملحّة للتحديث.

## 2026-08-11 — مجلد 384 ومشكلة زر "إنشاء مستودع Git"
- **المُلخّص**: زر "إنشاء مستودع Git" في واجهة opencode (إصدار 1.14.50) يعطي
  "Unexpected server error" — الخلل في الواجهة نفسها وليس الجيت (git init يعمل
  و opencode run نجح داخل 384). عُولج بإنشاء المستودع يدوياً في `~/384`
  (مع استثناء ملفات النماذج الضخمة وخطاف سجل التعديلات).
- **الملفات**: `~/384/.git`، `~/384/.gitignore`، `~/384/memory/CHANGELOG.md`.
- **مقترح مستقبلي**: تحديث opencode لإصدار أحدث قد يصلح الزر.

## 2026-08-11 — الالتزام التلقائي لكل تعديل
- **المُلخّص**: أُنشئ مكوّن opencode عام (`plugin/auto-commit.ts`) يسجّل كل تعديل ملف
  فورياً كالتزام جيت محلي، وربط في opencode.jsonc. اختُبر بنجاح: أنشأ opencode ملف
  اختبار فظهر التزام تلقائي `abefaa1` في نفس اللحظة.
- **الملفات**: `~/.config/opencode/plugin/auto-commit.ts`، `~/.config/opencode/opencode.jsonc`.
- **النتيجة**: أي محادثة جديدة تستطيع رؤية سجل كل التعديلات عبر `memory/CHANGELOG.md` + `git log`.
- **ملاحظات**: لا يرفع للإنترنت (محلي فقط)، لا يعمل خارج مستودع جيت، تعديلات bash لا تُلتزم.

## 2026-08-11 — تشخيص تكامل opencode مع git
- **المُلخّص**: تأكدنا عملياً أن تكامل opencode مع git (snapshots/undo/فروقات الجلسة)
  يعمل فقط داخل مستودع git — مشروع "global" (الجذر `/`) بلا vcs وبلا لقطات، بينما
  مشروع `my-app` فعّل `vcs=git` وأنشأ مجلد اللقطات (682K) فور تشغيله.
- **القرار**: العمل من `~/my-app` للحصول على تكامل كامل؛ الذاكرة تُقرأ من أي مجلد.
- **ملاحظة إضافية**: المودل `deepseek-ai/deepseek-v4-pro` انتهى (410 Gone في 2026-08-07)
  — يجب تحديثه بمودل حالي.

## 2026-08-11 — إعداد نظام الذاكرة وتتبع التعديلات
- **المُلخّص**: أُنشئ نظام الذاكرة الكامل: ذاكرة عامة (AGENTS.md)، ذاكرة مشروع
  (`memory/`)، مهارة `project-memory`، وخطاف `post-commit` لسجل التعديلات التلقائي.
- **الملفات**: `~/.config/opencode/AGENTS.md`، `AGENTS.md`، `memory/*`،
  `.opencode/skills/project-memory/SKILL.md`، `.git/hooks/post-commit`.
- **دروس**: التحقق من نجاح الفحص بالـ exit code الكامل؛ لا grep مُصفّى.

## 2026-08-11 — الربط مع GitHub والرفع الأول
- **المُلخّص**: تثبيت GitHub CLI وتسجيل الدخول بحساب `adibadm409-eng` (طريقة
  المتصفح/device code)، إنشاء مستودع خاص `property-manager-app` ورفع التطبيق.
- **الملفات**: كل المشروع — الالتزام الأول `472dff0`.
- **قرارات**: خاص PRIVATE، فرع `main`، استثناء `dist-bundle` و `metro.log`.

## 2026-08-11 — إصلاح فحص TypeScript لحزمة "open agent"
- **المُلخّص**: خطأ `Property 'error' does not exist` في `toolSchemas.ts` — السبب
  الحقيقي `strictNullChecks` معطّل في tsconfig الحزمة؛ عولج بتمكينه.
- **الملفات**: `toolSchemas.ts` (منطق if/else)، `tsconfig.json` (strictNullChecks).
- **قرارات**: انظر DECISIONS.md.

---

## 2026-08-19 — تحقق: خانة رفع وسائط (صور/فيديو) للعقارات موجودة وكاملة
- **الملخص**: تأكيد وجود رفع وسائط حقيقي للعقار مستقل عن أيقونة العقار:
  - `PropertyForm.tsx` خانة «معرض الصور والفيديوهات»: اختيار من المكتبة
    (`MediaTypeOptions.All` = صور وفيديو) وتصوير بالكاميرا (فيديو حتى 60ث)، حد 12
    وسيطاً، معاينات مصغرة مع حذف، وخلية نصية صريحة «مستقل عن صورة الأيقونة»؛
    الملفات تُنسخ إلى `property_media/` وتُخزَّن كـ JSON في عمود `properties.media`.
  - `PropertyDetail.tsx` يعرض «معرض العقار» عبر MediaStrip/MediaPreview مع تمييز
    الفيديو بالامتداد في `parseMediaList` (shareMedia.tsx).
  - الوكيل: أداة `attach_media_to_entity` (property/offer) + جدول `entity_media`
    لربط مرفقات المحادثة، وبرومبت كيمو يوجّه إلى استخدام media لا icon_uri.
- **الملفات**: PropertyForm.tsx, PropertyDetail.tsx, shareMedia.tsx, domainTools.ts,
  workspace.ts (linkAttachmentToEntity), db.ts (entity_media).

---

## 2026-08-19 — فصل الأدوات عن المهارات + إصلاح جذري لـ broker_name (قاعدة قديمة)
- **المُلخّص**: بأمر المستخدم "حرر الوكيل / اجعل الأدوات مفصولة عن المهارات بحيث هو من يقرر
  المهارة والأداة": أُزيلت بوابات الكود التي كانت تحجب أدوات الكتابة —
  (1) `getAgentFunctions` صارت تعرض **كل أدوات التطبيق** بلا فلترة حسب المهارة،
  (2) حُذف إنكار `skillAllowsTool` في `executor.ts` (لم تعد مهارة تحجب أداة)،
  (3) حُذفت بوابة `s.mode === 'read'` عن أدوات الكتابة و`undo_last` في `invokeTools.ts`،
  (4) حُدّث `modeNote` والـ execute wrapper ليعكسا أن الوكيل يقرر المهارة والأداة.
  بقيت بوابات الموافقة على الحذف والعكس المالي كما هي (مطلوبة صراحة).
- **الاكتشاف الجذري**: سجل Metro أظهر خطأً حقيقياً من جهاز المستخدم
  `no such column: broker_name` — فحص `initSchema` كشف السبب: `CREATE INDEX
  idx_properties_broker ON properties(broker_name)` يُنفَّذ **قبل** `safeMigrate`
  الذي يضيف العمود، فعلى قاعدة قديمة يفشل المؤشّر ويرفض كتلة التهيئة كاملةً
  فلا يُنفَّذ `safeMigrate` إطلاقاً ويبقى العمود ناقصاً (وهو أصل شكوى "بروكر نيم غير موجود").
- **الإصلاح**: أعيد ترتيب التهيئة إلى (1) كل CREATE TABLE IF NOT EXISTS،
  (2) `safeMigrate` لإضافة الأعمدة الناقصة، (3) كتلة CREATE INDEX داخل try/catch
  غير قاتلة — فيعمل الترقيم على القاعدتين الجديدة والقديمة.
- **الملفات**: `src/assistant/prompts.ts`, `src/assistant/executor.ts`,
  `src/assistant/invokeTools.ts`, `src/database/db.ts` (initSchema).
- **الحالة**: tsc بلا أخطاء في الملفات المحررة؛ Metro أُعيد تشغيله (pid غير ثابت)
  ويخدم الحزمة الجديدة؛ المستخدم يُعاد فتح التطبيق ليتلقاها.

---

## 2026-08-19 — التحقق من حقل broker_name وتطابق كتالوج الوكيل مع مخطط SQLite
- **المُلخّص**: بناءً على شكوى المستخدم "بروكر نيم غير موجود"، تحقّق آلي شامل عبر
  سكربت `catalog_vs_db.mjs` قارن كل حقل في كل كيان بـ`catalog.ts` مع الأعمدة
  الفعلية النهائية في `db.ts`/`projects.ts` (CREATE TABLE + كل ALTER TABLE في
  `safeMigrate` + جداول offers المُرحَّلة) — **النتيجة: صفر حقول مفقودة** في كل
  الكيانات الـ13. `broker_name` في جدول properties (إنشاء + ترحيل) وسطر 146 من
  الكتالوج، وقابل للكتابة عبر `pickData`/`assertKnownPatchFields`.
- **آلية الوكيل**: `schema_inspect` يقرأ `sqlite_master` + `PRAGMA table_info`
  الحقيقيين (`src/agent/registry.ts:139-169`) — لا يخمّن حقلاً.
- **الخلاصة**: الخطأ "غير موجود" ليس من الكود/المخطط المحلي؛ المفسّر المرجّح: قاعدة
  بيانات قديمة على جهاز المستخدم لم تُنفَّذ فيها `safeMigrate` (خصوصاً أن التطبيق
  كان عالقاً على "جاري التحميل" سابقاً فربما لم يُفتح DB إطلاقاً) أو هلاوس نموذج.
- **الملفات**: `src/agent/catalog.ts`, `src/database/db.ts` (safeMigrate@18, initSchema@336),
  `src/agent/crud.ts` (pickData@84, assertKnownPatchFields@101), `src/agent/registry.ts`.
- **حالة مفتوحة**: لم يروهّن بعد مستخدم للخطأ نفسه بعد وصول التطبيق للواجهة.

---

## 2026-08-11 — اكتمال أول بناء APK موقّع بمفتاحنا (نجاح كامل)
- **المُلخّص**: خط عمل GitHub Actions `build-apk.yml` يبني APK موقّعاً رسمياً
  ويتحقق آلياً من تطابق بصمة التوقيع (f3049ac1...). آخر تشغيل: success،
  "SIGNATURE MATCH" مؤكدة.
- **الإصلاحات أثناء الرحلة**:
  1. كراش الفتح ← `expo-clipboard` كان 57.0.1 بدل ~8.0.8 المطلوب لـ SDK 54.
  2. حذف مكتبات غير مستخدمة: expo-media-library, expo-web-browser,
     react-native-reanimated, leaflet, fuse.js.
  3. تقليص: abiFilters arm64-v8a + proguard + shrinkResources → 41.5MB.
  4. فخ قالب SDK 54: يوقّع release بـ debug.keystore دائماً → رقعة build.gradle
     (signingConfigs.release من خصائص RELEASE_*).
  5. فخ org.gradle.parallel يكسّر codegen/CMake → أُزيل.
  6. فخ apksigner المكسور على الـ runner → java -jar apksigner.jar.
- **الأسرار على GitHub**: KEYSTORE_BASE64, KEYSTORE_PASSWORD, KEY_ALIAS,
  KEY_PASSWORD (تفاصيلها في keystore/README.txt خارج الجيت).
- **وثائق جديدة**: `docs/BUILD.md` (عامة) + تحديث `keystore/README.txt` (سرية).
- **حالة الـ APK**: في Artifacts بأحدث تشغيل أخضر — app-release.apk (~41.5MB).

---

## 2026-08-19 — إعادة هندسة شاشة كيمو (UI-Driven-by-Agent) — الجزء 2
- **المُلخّص**: أُنجزت إعادة هيكلة `AssistantScreen.tsx` كقشرة رفيعة فوق مخزن Zustand
  (`agentChatStore.ts`) + سجل مكوّنات عديم العقل (`registry.tsx`) + رابط أحداث
  (`useAgentEvents.ts`). الشاشة أصبحت "مترجماً فورياً" للأحداث دون أي if/else على
  نوع الرسالة داخلها.
- **الملفات الجديدة/المعدّلة**:
  - `src/screens/assistant/agentChatStore.ts` (Zustand: items/activeContext/executionSteps/auditTrail/statusBar/streamText + applyEvent يحوّل أحداث الوكيل إلى عناصر).
  - `src/screens/assistant/registry.tsx` (مكوّنات: ToolStep/AskCard/ConfirmCard/LinkCard/FileCard/DecisionCard/ObservationCard/CompletionPulse/UserBubble/AssistantMessage/Error/System + ContextBanner/ExecutionStatusBar/AuditDrawer). كل handlers من `RegistryCtx` لا من per-item.
  - `src/screens/assistant/useAgentEvents.ts` (subscribeAgent → store.applyEvent، وreload على done/error).
  - `src/screens/assistant/AssistantScreen.tsx` أُعيدت كتابتها كقشرة (FlashList→FlatList لتفادي مخاطر scroll API) مع حفظ علامات الفحص النصّية داخلها: `useAudioRecorder`, `const [attachments`, `DocumentPicker`, `handleSend`, `cancelAgent`, `إيقاف التسجيل وإرساله`.
- **سلوك ثنائي الأسطح**: أحداث الوكيل الحيّة (decision/observation/completion + الكروم: ContextBanner/StatusBar/AuditTrail) تُغذّى لحظياً؛ وعند `done/error` يُعاد جلب الرسائل المحفوظة (`getMessages`) وتُعرض من `items` (tool/link/file/ask/confirm/error/text/user). الازدواج ممنوع: tool_call المجرّد يُهمَل في setMessages.
- **التحقق**: `tsc --noEmit` (0) + `eslint src/screens/assistant` (0) + `agent_input_surface_invariants` PASS + `audio_input_invariants` PASS + `screen_catalog_invariants` PASS.
- **تنبيه**: لم تُشغَّل بعد ملفات `test:invariants` المعتمدة على `tsx` (غير مثبّت محلياً) — تُركت للتشغيل عبر GitHub Actions. لا تلمس `react-native-reanimated` (خطر بناء).

---

## 2026-08-19 (تتمة) — تنظيف ردود الوكيل + توسيع خانة الكتابة
- **المُلخّص**: عالجنا تسريب المعرّفات الداخلية (مثل `mszh218axqdkqv`, `mt0hby0a2fx5m1`)
  وأكواد الحالة الخام (مثل `pending`, `buy_offer`) في فقاعات المساعد وبطاقات
  خطوات الأداة، أمام المستخدم. الحل ثنائي الطبقة: توجيه صريح في البرومبت + شبكة
  أمان برمجية (sanitizer) عند حدود العرض. وكذلك وسّعنا خانة الكتابة بدمج زرّي
  الإرفاق (ملف/صورة) في زر واحد.
- **ملفات جديدة**: `src/assistant/sanitize.ts` — `sanitizeAssistantText(text)`:
  تترجم الرموز إلى تسميات عربية، تشذب المعرّفات الداخلية (سلسلة حروف/أرقام ≥10
  تحتوي حرفاً ورقماً)، تزيل علامات backtick، وتنظّف المسافات.
- **تعديلات**:
  - `src/assistant/persist.ts`: `persistAssistantText` يُطهّر `content` قبل الحفظ
    (يغطي كل المسارات: النهائي/الخطأ/النظام).
  - `src/assistant/executor.ts`: يُطهّر `liveText` المبثوث حيّاً (stream) والنهائي
    `finalText` (persist + emits). لا يُمسّ الملاحظة المُعادة للنموذج (يحتاجها
    للمتابعة) — التنظيف للعرض فقط.
  - `src/screens/assistant/registry.tsx`: `ToolStepView` يُطهّر `detail` و`resultText`
    المعروضين (دون المساس بالملاحظة الخام في المتجر).
  - `src/assistant/prompts.ts`: أُضيفت فقرة مانعة صريحة مع مثال "ممنوع/صحيح" في
    قسم "إظهار النتائج" (قاعدة 13 الأصلية توجب عدم إظهار تقنيات، لكن النموذج
    كان يتجاهلها — الآن بأمثلة ملموسة).
  - `src/screens/assistant/AssistantScreen.tsx`: دُمج زرّا الإرفاق (ملف/صورة) في
    `handleAttach` واحد (Alert بخيارين) → خانة النص `flex:1` اتسعت ~50px.
- **التحقق**: `tsc --noEmit` (0) + `eslint` (0) + `agent_input_surface`/`audio_input`/
  `screen_catalog` invariants كلها PASS.

---

## 2026-08-19 (تتمة) — إعادة هيكلة التنقّل: شريط جانبي بدل «المزيد»+«المشاريع»
- **السبب**: الشريط السفلي كان فيه 7 تبويبات (مضاد لنمط التصميم)؛ «المزيد» تبويب
  يسرد تبويبات أخرى (نمط رديء). طلب المستخدم شريطاً جانبياً وزراً علوياً.
- **التغيير (محصور في `App.tsx`، بلا مكتبات جديدة)**:
  - الشريط السفلي أصبح 5 تبويبات فقط: العقارات/العملاء/العروض/الخريطة/المساعد.
  - أُضيف `Root.Navigator` (NativeStack) فوق `Tabs`؛ رُفعت شاشات «المزيد» و«المشاريع»
    لتكون مسارات جذرية مباشرة (Projects, KimoOperations, ToolsExport, BackupManager,
    ViewingsList, ViewingForm, CampaignsList, CampaignForm, Reminders, ReportsMain,
    Settings, MapSettings, MapKeysSettings, About) حتى يعمل التنقّل من الدرج.
  - حُذفا `MoreMenuScreen` و`MoreStack`؛ استُبدلا بـ `SideMenuProvider` + `MenuFab`
    (زر عائم أعلى الزاوية يمين/RTL) + `SideMenuOverlay` (لوحة جانبية منزلقة بـ
    Animated من الجهة اليمنى، بلا react-native-reanimated).
  - زر الإغلاق داخل اللوحة + خلفية معتمة تُغلق عند الضغط.
- **التحقق**: `tsc --noEmit` (0) + `eslint App.tsx` (0) + كل الفحوصات الثلاثة PASS.
- **ملاحظة**: لم تُشغَّل واجهة التطبيق فعلياً (لا محاكي)؛ التحقق آلي فقط. الزر العائم
  قد يتداخل بصرياً مع ترويسات بعض الشاشات — يُراجَع عند التشغيل.

---

## 2026-08-19 (تتمة 3) — إصلاح جذري: الترويسة العلوية لا تعرض المسميات/أزرار
- **السبب الجذري**: `AppHeader` كان يقرأ `options.title`/`headerRight`، لكن خيارات
  الشاشات المتداخلة لا تطفو عبر ملاحٍ `headerShown:false` (Tabs/Stacks) إلى ترويسة
  `Root.Navigator` — فكانت الترويسة فارغة دائماً (بلا مسميات أقسام ولا زر سجل المحادثات
  ولا زر وضع المساعد).
- **الحل**:
  - `AppHeader` يستمدّ المسمى من **اسم المسار النشط** عبر `useNavigationState` +
    `getActiveRouteName` + `TITLE_MAP` (كل المسارات).
  - أزرار الترويسة (خصوصاً عناصر المساعد) عبر **سياق `HeaderCtx`** مشترك
    (`src/navigation/headerContext.ts`): `RootNav` يحمل `headerRight` ويوفّره، و
    `AssistantScreen` يسجّل أزراره (السجل/وضع التعديل/الإعداد) عبر `setRight`.
  - بُدّل `header: (props)=><AppHeader {...props}/>` بـ `header: ()=><AppHeader/>`.
- **تحسين بطاقة الفلاتر** (`Properties.tsx`): زر «فلتر» أنيق بجانب البحث (أيقونة + نص +
  شارة عدّاد) بلا سهم مزعج، و`filterSheet` القابل للطي أُعيد ترتيبه بمجموعات واضحة
  (الحالة/النوع/السعر) مع تسميات وبطاقات سعر مرتّبة عمودياً.
- **الملفات**: `App.tsx`، `src/navigation/headerContext.ts` (جديد)،
  `src/screens/Properties.tsx`، `src/screens/assistant/AssistantScreen.tsx`.
- **التحقق**: `tsc` (0) + `eslint` (0) + الفحوصات الثلاثة PASS.

---

## 2026-08-19 (تتمة 2) — زر عائم للأقسام + زر ترويسة لسجلات المحادثات + تحسينات
- **القرار**: «الأقسام» (العقارات/العملاء/العروض/المشاريع/المشاهدات/الحملات) = زر
  إضافة **عائم** عالي الجودة (`src/components/SectionFab.tsx`: دائري، ظل، حلقة).
  «السجلات = سجلات المحادثات مع الذكاء الاصطناعي» = زر في **الترويسة العلوية**
  (نُقل زر «محادثة جديدة» من تذييل `AssistantHistory` إلى ترويسة الـ sheet).
- **التغييرات**:
  - أُزيلت أزرار الإضافة الداخلية من Properties/Clients/Offers/ProjectsScreen/
    Viewings/Campaigns (ترويسات/أزرار مكررة) وأُضيف `SectionFab` لكلٍّ منها.
  - `AssistantScreen`: حُذفت الترويسة الداخلية «كيمو» ونُقلت أزرارها (السجل/وضع
    التعديل/الإعداد) إلى الترويسة العلوية عبر `useLayoutEffect` + `navigation.setOptions`
    (headerRight يطفو إلى AppHeader). عُدّل `AppHeader` ليسمح لـ headerRight بعرض
    عدة أزرار.
  - اللوحة الجانبية: تثبيت الارتكاز `right:0` (تبقى على اليمين في RTL) وتصغير عناصرها.
  - `Properties`: الفلاتر أصبحت بطاقة زر أنيقة بجانب شريط البحث تفتح sheet قابلاً
    للطي (مع شارة بعدّاد الفلاتر النشطة).
- **الملفات**: `src/components/SectionFab.tsx` (جديد)، `App.tsx`، `src/screens/Properties.tsx`،
  `src/screens/Clients.tsx`، `src/screens/Offers.tsx`، `src/screens/Viewings.tsx`،
  `src/screens/Campaigns.tsx`، `src/screens/projects/ProjectsScreen.tsx`،
  `src/screens/assistant/AssistantScreen.tsx`، `src/screens/assistant/AssistantHistory.tsx`.
- **التحقق**: `tsc` (0) + `eslint` (0) + الفحوصات الثلاثة (agent_input_surface/
  audio_input/screen_catalog) PASS.
- **ملاحظة**: لم يُشغَّل المحاكي؛ التحقق آلي. زر الفلاتر وبطاقة البحث وبقية
  التعديلات تحتاج مراجعة بصرية عند التشغيل.

---

## 2026-08-19 (تتمة) — تعديل زر القائمة: ترويسة علوية بدل الزر العائم
- **الطلب**: الزر العائم كان يغطي الأزرار/المسميات؛ أراده زراً عادياً داخل الشاشة
  أعلى اليمين، مع بقاء اللوحة تنزلق من اليمين وتُغلق بضغط الخارج، وترتيب الأزرار
  حسب الأولوية.
- **التغيير**: حُذف `MenuFab` العائم؛ أُضيف `MenuButton` (زر عادي) داخل `AppHeader`
  (ترويسة علوية موحّدة على `Tab.Navigator` عبر `headerShown:true` + `header: ()=><AppHeader/>`).
  الترويسة تعرض اسم التطبيق + زر القائمة (يمين في RTL)، ومحتوى الشاشات يُدفع
  تلقائياً أسفلها (بلا تداخل). اللوحة تفتح من اليمين (`right:0`) وتُغلق بضغط الخلفية.
- **ترتيب الأولوية في اللوحة**: المشاريع ← [فاصل] ← التقارير/الأدوات/النسخ ← [فاصل]
  ← إشراف Kimo/المشاهدات/التذكيرات/الحملات ← [فاصل] ← الإعدادات/حقوق الملكية.
- **التحقق**: `tsc` (0) + `eslint App.tsx` (0) + الفحوصات الثلاثة PASS.

## 2026-08-19 — تنظيف مساحة تيرمكس (~13G)
- حذف proot-distro كامل (Debian containers 4.4G + Ubuntu rootfs 1.5G + dlcache 144M) — آخر استخدام مايو 2026، معزول عن العمل.
- حذف metasploit-framework (240M، مهجور منذ 2022).
- حذف ملفات بناء 384 فقط: `embedding-app/node_modules` (742M) + `~/node_modules` (156M)؛ أُبقي model.safetensors و memory/ و .git.
- حذف كاشات npm (~/.npm _cacache+_npx 3.65G)، node-gyp/pnpm/pip/prisma (~1.08G)، ومؤقتات usr/tmp (~380M).
- المحفوظ: ذاكرة opencode (opencode.db 572M)، usr/tmp/opencode، ~/.config/opencode، matcher بـ opencode 1.17.7.
- النتيجة: 23G متاح → 36G (85%).

## 2026-08-29 — تقوية المحرك TypeScript + إزالة تبعيات Chaquopy من التوصيل
- **القرار**: المستخدم أكّد الإبقاء على TypeScript كمحرك وحيد (لا Chaquopy، لا بايثون في التطبيق). التطبيق `my-app` أصلاً موصول بـ TypeScript في `src/assistant/` — التجربة السابقة لـ Chaquopy كانت في مستودع منفصل. تمحور العمل حول تقوية المحرك الموجود + إضافة ميزات جديدة فوقه.
- **أُنجِز**:
  1. **`src/assistant/orchestrator.ts` (جديد)**: `runSubAgents(sessionId, tasks)` ينفذ قائمة مهام مستقلة بالتوازي عبر `Promise.all` + `runToolWithFeedback`، يعيد `{results[], summary{ok,failed,verified}}`، وكل نتيجة تحمل `confidence` (0-1) و`observation` و`verified`. `reviewSubAgentResults` و`undoLastSubAgent` للمراجعة/التراجع. صُمِّم للطلبات المركّبة عبر أقسام متعددة.
  2. **`invokeTools.ts`**: فرع جديد لـ `name === 'orchestrate'` — modes: execute/review/undo؛ يصدر نتيجة مدمجة في `progress` ويعالج فشل أي وكيل فرعي دون إيقاف الباقين.
  3. **`prompts.ts`**: تسجيل `orchestrate` كـ wrapper function بأوصاف واضحة + توجيه بالنظام للطلبات المركّبة.
  4. **`executor.ts`**: تحويل `validateToolCallBatch` و`readIntentRequiresEvidence` من حراس قاسية (توقف + continue) إلى **مؤشرات ثقة** تُسجَّل في `brainOps` (kind=confidence) ولا تمنع التنفيذ — يُسمح للوكيل بالمتابعة مع نسبة ثقة مرئية.
  5. **`history.ts`**: `compressMiddleToolMessages(out, budgetTokens=9000)` يقدّر تكلفة الرموز ويضغط الملاحظات الوسيطة الطويلة ويُدخل ملخصاً للنظام يذكر مستوى الثقة العام — لإدارة السياق الطويل دون فقدان الخطة.
  6. **`toolSchemas.ts`**: `adaptToolArgs` يطبّق `normalizeRowKeys` لمرونة أسماء الأعمدة/الحقول (`name`/`الاسم`/`title`، `amount`/`price`/`value`، `phone`/`mobile`/`جوال`، `status`/`الحالة`، `area`/`مساحة`/`area_sqm`) — تطبيع Arabic/English.
  7. **`src/components/TaskCard.tsx` (جديد)**: بطاقة مهام قابلة للطي ملتصقة بخانة الإدخال، تقرأ `_plan` و`executionSteps` من `agentChatStore`، تعرض done/total وشريط تقدم لكل خطوة.
  8. **`AssistantScreen.tsx`**: استيراد وعرض `<TaskCard />` فوق `inputArea`.
- **التحقق**: `tsc --noEmit --skipLibCheck` على الملفات المعدّلة (orchestrator/executor/history/toolSchemas/prompts/invokeTools/TaskCard/AssistantScreen) → **0 أخطاء** في توصيف المشروع. الأخطاء السابقة في `python-agent/**` و`tsconfig` flags مرجعيات قديمة غير متأثرة.
- **بقي للتنفيذ لاحقاً**: (1) TaskCard يتلقى plan من `agent_task_runs` أكثر تفصيلاً بدل `_plan`، (2) الترجمة المتوازية الكاملة للحلقة التكرارية في executor، (3) تجربة Chaquopy Python 3.12 كاحتمال أخير.
- **دروس ميدانية**: tsc الكامل OOM على أندرويد (1.9GB available)؛ الحل: فحص مشروع كامل لكن grep مفلتر على الملفات المعدّلة فقط، أو فحص per-file بحدود.
