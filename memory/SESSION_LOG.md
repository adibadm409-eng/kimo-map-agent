# سجل الجلسات — Session Log

سجل ما أنجزناه في كل جلسة. يكتبه المساعد بعد كل مهمة.
التنسيق: التاريخ — الملخص — الملفات المتأثرة. الأحدث في الأعلى.

---

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
