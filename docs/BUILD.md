# بناء النسخة الموقّعة (APK) — دليل مرجعي

> آخر تحديث: 2026-08-11 — آخر بناء ناجح بحالة خضراء ومطابقة توقيع مؤكدة.

## 1) كيف يعمل البناء
- ملف العمل: `.github/workflows/build-apk.yml`
- يُشغَّل تلقائياً عند كل `push` إلى `main`، أو يدوياً عبر
  تبويب **Actions → Build Signed APK → Run workflow**.
- البيئة: ubuntu-latest (Node 20، Java 17، Android SDK).
- الخطوات: تثبيت التبعيات → `expo prebuild` → إعادة المفتاح من الأسرار →
  رقعة `build.gradle` للتوقيع الرسمي → إعدادات Gradle → `assembleRelease` →
  **تحقق آلي من المطابقة** (يفشل البناء إذا لم يُوقَّع الـ APK بمفتاحنا) → رفع الأرتيفكت.

## 2) موقع الـ APK النهائي
- تبويب **Actions** في المستودع → آخر تشغيل أخضر → **Artifacts** →
  `realestate-app-release` → ملف `app-release.apk` (تثبيت مباشر من الهاتف).

## 3) الأسرار المطلوبة في GitHub (بدون قيمها — انظر keystore/README.txt)
| اسم السر | الغرض |
|---|---|
| `KEYSTORE_BASE64` | المفتاح كاملاً بصيغة base64 |
| `KEYSTORE_PASSWORD` | كلمة سر المخزن |
| `KEY_ALIAS` | الاسم المستعار للعنصر |
| `KEY_PASSWORD` | كلمة سر المفتاح |

## 4) هوية التوقيع (عام — غير سري)
- الاسم المستعار: `realestate`
- بصمة SHA-256: `F3:04:9A:C1:BA:86:43:59:5C:36:36:25:E6:6C:48:24:EA:82:D2:D7:FA:97:43:C0:51:38:C8:29:0A:FD:C2:A4`
- بصمة (مختصرة): `f3049ac1ba864359...0afdc2a4`
- أي APK لاحق يجب أن يطابق هذه البصمة (البناء يتحقق آلياً ويفشل عند عدم التطابق).

## 5) التحسينات المطبقة على الحجم والأداء (2026-08-11)
| الإجراء | الأثر |
|---|---|
| إصلاح `expo-clipboard` من 57.0.1 → 8.0.8 | **أصلح الكراش عند الفتح** (عدم تطابق مع SDK 54) |
| حذف 5 مكتبات غير مستخدمة: `expo-media-library`, `expo-web-browser`, `react-native-reanimated`, `leaflet`, `fuse.js` | حجم + استقرار |
| `abiFilters: ["arm64-v8a"]` | APK يعمل على كل الهواتف الحديثة (64-bit) — يقلص المعماريات الزائدة |
| `enableProguardInReleaseBuilds` + `enableShrinkResourcesInReleaseBuilds` | ضغط DEX والموارد |
| كاش Gradle في الـ CI (`actions/cache`) | بناءات لاحقة أسرع بكثير |
| رقعة `build.gradle` | إجبار توقيع release بمفتاحنا بدل debug (فخ قالب SDK 54) |

- الحجم الفعلي: 41.5MB (كان 44.7MB للملف القديم بكل المعماريات وبلا ضغط).

## 6) فخاخ موثّقة (لا تكررها)
- **فخ قالب Expo SDK 54**: `expo prebuild` يولّد `android/app/build.gradle`
  يوقّع release بمفتاح **debug** دائماً — لا يقرأ `keystore.properties`.
  الحل: رقعة بايثون في خطوة "Configure signing" تضيف `signingConfigs.release`
  المقروء من خصائص `RELEASE_*` في `gradle.properties`.
- **فخ `org.gradle.parallel`/`configureondemand`**: يكسر ترتيب توليد كود
  react-native (codegen) فتسقط `configureCMake` بخطأ
  "add_subdirectory ... not existing directory". لا تستخدمهما إلا بعد اختبار.
- **فخ apksigner على الـ runner**: مشغّل `apksigner` المكسور
  ("Unsupported command"). الحل المعتمد: استدعاء `apksigner.jar` مباشرة عبر
  `java -jar`.
- **لا تغطّ فشل التحقق بأنبوب `| head`** — يخفي الكود الخروج غير الصفري.

## 7) إعادة البناء بعد أي تعديل مستقبلي
1. أجرِ تعديلاتك ثم `git push` إلى `main` — البناء ينطلق تلقائياً.
2. راقب: `gh run watch --repo adibadm409-eng/property-manager-app` من داخل `~/my-app`.
3. لا يلزم أي خطوة يدوية — الأسرار موجودة، والرقعة تُطبَّق في كل بناء.
4. **لا تغيّر المفتاح/كلمة السر** إلا إذا قبلت إلغاء تثبيت التطبيق القديم.