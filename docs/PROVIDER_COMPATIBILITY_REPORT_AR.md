# تقرير توافق كيمو مع المزودات والإدخالات والأدوات

**الفرع:** `production-hardening-local`  
**Commit البناء:** `1a5c643da5c91b4bcca55d8aad67d9af530b571a`  
**تاريخ التقرير:** 17 أغسطس 2026

## الخلاصة التنفيذية

أُعيد اختبار طبقة المزودات بعد ظهور رفض Gemini بسبب `thought_signature` ثم رفض Mistral بسبب `extra_content`. النتيجة ليست إضافة استثناءات متفرقة؛ أصبحت دورة الطلب الآن مبنية على عقد داخلي واحد، ثم محول سلكي يختار معيار الواجهة وفق المزود والموديل. لذلك لا يخرج `thought_signature` من Gemini إلى Mistral أو OpenAI، ولا يخرج `extra_content` إلى Mistral، ولا تُرسل خيارات DashScope الخاصة إلا عندما يحمل الطلب أدوات فعلياً.

> **القاعدة التشغيلية:** إذا لم تثبت بوابة القدرات أن الموديل يدعم Chat Completions أو الأدوات أو الصور أو الصوت أو التوازي، يُحجب الطلب محلياً قبل `fetch`. هذا الحجب متعمد ويمثل نجاحاً في اختبار السلامة، وليس رفضاً من المزود.

## نتيجة الاختبارات

| الاختبار | النتيجة | التفاصيل |
|---|---:|---|
| مصفوفة payload | PASS | 324 حالة عبر 8 عائلات مزودات وموديلات ممثلة و9 أنواع إدخال/دورة |
| حالات payload القابلة للإرسال | PASS | 205 حالات اجتازت البناء والتحقق |
| حالات محجوبة قبل الشبكة | BLOCKED متوقع | 119 حالة لموديلات أو قدرات غير مثبتة؛ لم تُرسل إلى أي endpoint |
| حالات فشل غير متوقع | 0 | لا توجد FAIL في ملف المصفوفة |
| runtime wire مع fetch معترض | PASS | 14 طلباً محلياً شملت جميع المزودات، tool calls، Gemini signature، Mistral، custom بلا بث، وSSE |
| تصنيف أخطاء HTTP والشبكة | PASS | 400/401/404/422 لا تُعاد؛ 429/5xx/network تدخل سياسة التعافي |
| roundtrip من سجل المحادثة | PASS | تجميع assistant tool calls المتوازية وحفظ نتائجها وإعادة بث metadata |
| الإدخال الصوتي | PASS | `expo-audio`، إذن الميكروفون، التسجيل، القراءة المحلية، بوابة الموديل، وتمرير `input_audio` |
| TypeScript | PASS | `tsc --noEmit` |
| ESLint | PASS | `--max-warnings 0` |
| تثبيت نظيف | PASS | `npm ci` |
| حزمة التراجع الكاملة | PASS | جميع invariants القائمة والجديدة |

## ما الذي غطته المصفوفة؟

تكررت الحالات التالية على كل مزود وموديل ممثل: رسالة نصية، مرجع مرفق محلي، صورة `image_url`، صوت `input_audio`، إدخال مختلط صورة وصوت، نداء أداة مفرد، نداءات أدوات متوازية، نتائج أدوات مرتبطة، وإعادة إرسال `thought_signature` أو metadata سابقة. كما اختُبرت حالات موديلات embedding وimage-generation وASR وموديلات الصوت غير المدعومة للتأكد من أنها تتوقف قبل الشبكة.

المزودات التي غطتها المصفوفة هي **Gemini، OpenAI، Mistral، DeepSeek، DashScope/Qwen، OpenRouter، NVIDIA NIM، وCustom**. وتمت إضافة نماذج ممثلة من النص والأدوات والصوت والرؤية والموديلات المتخصصة غير الصالحة لمسار Chat Completions. التقرير الخام القابل للمعالجة موجود في [`PROVIDER_COMPATIBILITY_MATRIX_AR.json`](./PROVIDER_COMPATIBILITY_MATRIX_AR.json).

## قواعد المحولات النهائية

| العائلة | ما يُرسل | ما يُمنع |
|---|---|---|
| Gemini OpenAI-compatible | `extra_content.google.thought_signature` على مستوى tool call، ومعرف النداء الأصلي | فقدان التوقيع أو وضعه داخل `function` |
| OpenAI | عقد Chat Completions القياسي مع `input_audio: {data, format}` للموديل الصوتي | metadata خاصة بـGemini أو صوت إلى موديل نصي |
| Mistral | tool calls قياسية؛ Voxtral الصوتي يحول قيمة `input_audio` إلى Base64 وفق عقد Mistral | `extra_content` أو metadata مجهولة داخل payload |
| DashScope/Qwen | عقد OpenAI-compatible؛ Qwen-Omni يحتفظ بـ`data/format`، ويُبنى Data URI عند الحاجة؛ `tool_stream` فقط مع طلب أدوات مناسب | خيارات DashScope في طلب نصي بلا أدوات أو صيغة Mistral الصوتية |
| OpenRouter | عقد OpenAI-compatible محافظ وفق اسم المسار وقدراته | افتراض أن كل مسار يدعم الصوت أو الرؤية أو الأدوات |
| NVIDIA NIM | عقد Chat Completions القياسي عند دعم الموديل | حقول Gemini وأي صوت/صورة غير مثبتة |
| Custom | عقد OpenAI-compatible محافظ؛ لا بث افتراضي ولا توازٍ افتراضي | إرسال metadata أو توازٍ أو بث لمجرد أن الرابط يشبه OpenAI |

تستند هذه القواعد إلى توثيق Google لعقد OpenAI compatibility وfunction calling وaudio، وتوثيق OpenAI للصوت وfunction calling، وتوثيق Mistral وAlibaba Cloud وNVIDIA للعقود الخاصة بكل واجهة.[1] [2] [3] [4] [5] [6] [7] [8]

## اختبارات التشغيل والتعافي

اختبار runtime المحلي لم يرسل بيانات إلى الإنترنت؛ استبدل `fetch` بمستقبل محلي يتحقق من جسم الطلب ثم يعيد استجابات تمثيلية. شمل الاختبار طلباً عادياً لكل عائلة مزود، نداء أداة من Mistral ثم إعادة نتيجته، نداء Gemini مع توقيع ثم إعادة بثه، SSE مقسماً داخل JSON، مزوداً مخصصاً بلا بث، وحجب موديل embedding وحالة التوازي غير المدعوم قبل زيادة عداد الطلبات.

اختبار التعافي أثبت أن أخطاء `400` و`401` و`404` و`422` ثابتة ولا تُعاد عشوائياً، بينما `429` و`5xx` وفشل الشبكة قابلة لسياسة التعافي المحددة. وبذلك لا يعرض التطبيق للمستخدم تكرارات زائفة لطلب رفضه المزود بسبب payload ثابت.

## الإدخال الصوتي

أصبح زر الميكروفون فعلياً داخل شاشة كيمو، مع طلب إذن التسجيل، بدء وإيقاف التسجيل، حفظ مرجع الملف محلياً، وقراءة Base64 داخل الذاكرة فقط. لا يُخزن Base64 داخل SQLite. يمر التسجيل إلى الموديل فقط بعد تحقق `supportsInputAudio`، وتظهر للمستخدم رسالة محلية واضحة عند اختيار موديل غير صوتي. يطبق المحول صيغة مختلفة لكل عائلة عند الحاجة بدلاً من إرسال صيغة عامة للجميع.

## البناء الموقّع

تم تشغيل [GitHub Actions run 31978928917](https://github.com/adibadm409-eng/property-manager-app/actions/runs/31978928917) يدوياً من الفرع `production-hardening-local` بعد رفع commit الاختبارات. النتيجة `completed / success`، ونجحت داخله مراحل `Typecheck` و`Lint` و`Invariant tests` و`Generate Android project` و`assembleRelease` و`Verify APK signature` ورفع artifact.

**APK الناتج:** `kimo-provider-compatible-release.apk`  
**الحجم:** 91,892,478 بايت  
**SHA-256:** `0dbae82daab52165124d46849b61dc7f31e36ff68a418fc311c5c851d8655bac`

تم فحص بنية APK محلياً بواسطة `unzip -t` دون أخطاء، كما أن مطابقة شهادة APK مع keystore تمت داخل GitHub Actions ونجحت. وجود APK مرفق لا يعني أن المفاتيح أو حسابات المزودات أُرسلت إلى الاختبارات؛ الاختبارات الحية الفعلية تحتاج مفاتيح المستخدم وموديلات الحساب المنشورة.

## حدود يجب فهمها بدقة

الاختبار المحلي يثبت أن التطبيق **لن يرسل payload معروفاً بأنه غير متوافق**، وأن شكل payload لكل عائلة يمر عبر المحول الصحيح. لا يمكن إثبات توفر كل موديل أو حدود حسابك أو صحة مفاتيحك دون إجراء اتصال حي بمفاتيحك الفعلية، ولذلك لا يُسجّل الموديل غير الموجود في حسابك على أنه مدعوم لمجرد أن اسمه يطابق نمطاً. عند ظهور موديل غير معروف أو قدرة غير مثبتة، القرار الآمن هو الحجب المحلي لا المحاولة العشوائية.

أظهر `npm ci` وجود تحذيرات أمنية في شجرة الاعتمادات الحالية: **29 vulnerability** وفق npm، منها 11 متوسطة و18 عالية. لم أستخدم `npm audit fix --force` قبل البناء لأنه قد يغيّر إصدارات Expo وReact Native ويكسر APK؛ هذه مسألة صيانة مستقلة يجب معالجتها في فرع ترقية اعتمادات منفصل بعد تثبيت نسخة الإنتاج الحالية.

## الملفات الجديدة المهمة

| الملف | الغرض |
|---|---|
| `src/assistant/providerWire.ts` | المحولات السلكية وبوابة payload لكل عائلة مزود |
| `audit/provider_compatibility_matrix.mjs` | 324 حالة payload مع PASS/BLOCKED/FAIL |
| `audit/provider_runtime_wire_invariants.mjs` | اختبار تشغيل محلي للأدوات والبث والاستئناف |
| `audit/provider_failure_recovery_invariants.mjs` | تصنيف أخطاء HTTP والشبكة |
| `audit/history_tool_roundtrip_invariants.mjs` | حماية إعادة بناء سجل tool calls |
| `audit/agent_input_surface_invariants.mjs` | حماية النص والمرفقات والصوت والاستئناف والموافقة والإلغاء |
| `docs/PROVIDER_COMPATIBILITY_MATRIX_AR.json` | النتائج التفصيلية القابلة للقراءة الآلية |

## المراجع

[1]: https://ai.google.dev/gemini-api/docs/openai "Gemini OpenAI Compatibility"
[2]: https://ai.google.dev/gemini-api/docs/function-calling "Gemini Function Calling"
[3]: https://developers.openai.com/api/docs/guides/function-calling "OpenAI Function Calling"
[4]: https://developers.openai.com/api/docs/guides/audio "OpenAI Audio Guide"
[5]: https://docs.mistral.ai/studio-api/conversations/function-calling "Mistral Function Calling"
[6]: https://docs.mistral.ai/studio-api/audio/speech_to_text/offline_transcription "Mistral Audio and Voxtral"
[7]: https://www.alibabacloud.com/help/en/model-studio/qwen-function-calling "Alibaba Cloud Qwen Function Calling"
[8]: https://docs.nvidia.com/nim/large-language-models/latest/api-reference.html "NVIDIA NIM API Reference"
