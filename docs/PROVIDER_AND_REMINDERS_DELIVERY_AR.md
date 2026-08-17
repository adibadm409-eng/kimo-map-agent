# تقرير تسليم إعادة هيكلة Kimo والتنبيهات المحلية

**المشروع:** `property-manager-app`  
**الفرع:** `production-hardening-local`  
**Commit التنفيذ:** `fff1ddd`  
**إعداد التقرير:** Manus AI  
**التاريخ:** 17 أغسطس 2026

## الملخص التنفيذي

تم تطبيق إعادة هيكلة فعلية في طبقة Kimo بدلاً من الاكتفاء بتغيير أسماء الحقول أو تمرير جميع المزودات إلى مسار OpenAI واحد. أصبح منطق الوكيل يعتمد على عقد داخلي موحّد للرسائل والأدوات ونتائج الأدوات، بينما تُترجم هذه البنية إلى wire format خاص بكل عائلة مزود. أضيفت عائلة Anthropic Messages كمحول مستقل، وأصبح قرار إرسال الأدوات والبث والصوت والصورة والتوازي يعتمد على `Model Profile` لكل زوج `provider + model` وبسياسة محافظة تمنع إرسال قدرة غير مثبتة.

كما تمت ترقية التنبيهات من حقل منفرد داخل `offers` إلى كيان محلي موحّد يمكن أن يكون عاماً أو مرتبطاً بعرض أو عقار أو عميل أو معاينة أو مشروع أو دفعة أو حملة أو أي نوع كيان محلي آخر. أصبح من الممكن إنشاء عدة تنبيهات للكيان نفسه، وإلغاؤها منفردة بمعرفاتها، واستعراضها من Kimo ومن شاشة التذكيرات ومن بطاقة العرض.

> **النتيجة العملية:** لم يعد اختيار المزود يغيّر عقد أدوات Kimo الداخلي؛ التغيير يقتصر على adapter وModel Profile وسياسة الحقول التي يُسمح بإرسالها إلى ذلك الموديل.

## ما تم تطبيقه

| المجال | التغيير المنفذ | الأثر |
|---|---|---|
| العقد الداخلي | إضافة `canonical.ts` لتمثيل الرسائل والأدوات والنتائج دون metadata خاصة بمزود | فصل executor عن wire protocol |
| القدرات | إضافة `modelProfiles.ts` بمصدر وثقة وsupported parameters لكل `provider + model` | منع التخمين وإرسال الحقول اختيارياً فقط عند ثبوت الدعم |
| Anthropic | إضافة `anthropicWire.ts` ومسار `/messages` وheaders وtool-use/tool-result وSSE parsing | دعم معيار Messages الأصلي دون إجباره على Chat Completions |
| الأدوات | إضافة `toolValidation.ts` للتحقق من الاسم والوسائط والـrequired/types/enum والـduplicate IDs والتوازي | عدم تنفيذ أداة مجهولة أو ذات JSON تالف |
| البث | منع fallback بعد وصول تيار جزئي، ومنع تكرار أسماء الأدوات عند تجميع chunks | تقليل التكرار والفشل العشوائي في streaming |
| التاريخ | إبقاء metadata الخاصة بالمزود داخل adapter/history الآمن وعدم تسريبها إلى عائلات أخرى | حماية follow-up وtool result turns |
| التنبيهات | إضافة `target_type` و`target_id` إلى جدول `reminders` canonical | تنبيهات عامة أو مرتبطة بأي كيان محلي |
| التوافق الرجعي | backfill من `offer_reminders` والحقول القديمة `offers.reminder_at` و`reminder_notification_id` | عدم فقد بيانات المستخدم القديمة |
| واجهة العروض | البطاقة تعرض مجموعة reminders، والإضافة تلحق موعداً جديداً، والإلغاء يتم بمعرف التنبيه | دعم عدة تنبيهات دون استبدالها بصمت |
| Kimo | `create_reminder` يقبل target، و`list_reminders` يدعم التصفية، و`list_offer_reminders` و`reminders[]` للعروض | تخطيط وتنفيذ مرن ومتعدد الارتباطات |

## عقد التنبيهات الجديد

يُخزن كل تنبيه في جدول `reminders` مع `target_type` و`target_id`. يستخدم `target_type=general` للتذكير العام، بينما تستخدم الأنواع الأخرى علاقة اختيارية إلى الكيان المحلي. عند إنشاء تنبيه مرتبط، يجب أن يكون `target_id` موجوداً؛ وهذا يمنع إنشاء تنبيه يبدو مرتبطاً بينما لا يمكن تحديد السجل الذي يخصه.

تظل أعمدة العرض القديمة موجودة للتوافق مع قواعد البيانات والواجهات القديمة، لكنها لم تعد مصدر الحقيقة. عند القراءة، تُجمع التنبيهات من `reminders` عبر `target_type='offer'` و`target_id=offer.id`. وعند إلغاء تنبيه مرتبط بعرض، تُحدّث الأعمدة القديمة إلى أقرب تنبيه مجدول متبقٍ أو تُفرغ إذا لم يبق أي تنبيه.

## الاختبارات وبوابات الجودة

| البوابة | النتيجة |
|---|---|
| TypeScript `npm run check` | ناجح |
| ESLint `npm run lint` | ناجح بلا warnings |
| Expo Doctor | `18/18 checks passed` |
| Model Profile invariants | ناجح |
| Tool validation invariants | ناجح |
| Anthropic runtime wire | ناجح، طلبان معترضان |
| Unified reminder target invariants | ناجح |
| Provider compatibility matrix | ناجح، 351 حالة: 154 PASS و197 BLOCKED محلياً بسياسة fail-closed |
| Provider runtime wire | ناجح، 14 طلباً معترضاً |
| Provider failure/recovery | ناجح |
| History/tool roundtrip | ناجح |
| بقية invariants التطبيق | ناجحة، بما فيها domain workflow وKimo وscreens وproperties وempty database وcleanup |

حالات `BLOCKED` في matrix ليست رفضاً غير متوقعاً من مزود خارجي؛ هي حالات يمنعها التطبيق قبل الشبكة عندما لا يثبت Model Profile دعم الأدوات أو التوازي أو الصوت أو الصورة. هذا السلوك مقصود لتجنب إرسال طلب غير متوافق ثم عرض خطأ HTTP غامض للمستخدم.

## بناء APK

أُطلق بناء GitHub Actions من commit `fff1ddd` عبر [run 31986863704](https://github.com/adibadm409-eng/property-manager-app/actions/runs/31986863704). اكتملت خطوات Typecheck وLint وInvariant tests وGenerate Android project وBuild signed release APK وVerify APK signature وUpload artifact بنجاح.

| العنصر | القيمة |
|---|---|
| اسم artifact | `realestate-app-release` |
| حجم APK | `91,973,139` بايت |
| SHA-256 للملف | `b64d201811aa30e841e0d724a801375fc468ae8441fe0cd800ab6ca20c371957` |
| تحقق التوقيع | **SIGNATURE MATCH** في GitHub Actions باستخدام `apksigner` ومقارنة شهادة keystore |
| تحقق ZIP محلي | `No errors detected in compressed data` |

## الحدود التي يجب إعلانها بصدق

تم اختبار طبقة النقل محلياً عبر اعتراض طلبات حقيقية من مسار `chatWithRetry` وبـfixtures تمثل wire responses، كما تم اختبار عقد الأدوات والتاريخ والفشل. هذه الاختبارات تثبت أن التطبيق يبني الطلب الصحيح ويمنع payload غير المثبت، لكنها لا تثبت أن كل مفتاح API للمستخدم صالح أو أن كل موديل مدفوع متاح في حسابه.

بناء APK وتحقق التوقيع نجحا في CI. لم يتوفر في بيئة التدقيق جهاز Android فعلي أو emulator قابل للتشغيل لاختبار الضغط على كل شاشة، ولا يمكن اعتبار ذلك اختباراً ميدانياً للإشعارات عند إغلاق التطبيق. لذلك يجب تثبيت APK على جهاز Android فعلي والتحقق من صلاحية الإشعارات، إنشاء تنبيهين أو أكثر للعرض نفسه، إنشاء تنبيه لعقار وعميل ومشروع، إلغاء تنبيه واحد مع بقاء الآخرين، ثم إغلاق التطبيق وانتظار موعد قصير مستقبلي.

يجب أيضاً تدوير مفاتيح Gemini وMistral المستخدمة في الاختبارات السابقة لأنها ظهرت في سياق المحادثة. لا توجد مفاتيح داخل commit التنفيذ وفق فحص الأسرار قبل الدفع.

## الملفات الأساسية

الملف `src/assistant/canonical.ts` هو العقد الداخلي، و`src/assistant/modelProfiles.ts` مصدر قرار القدرات، و`src/assistant/anthropicWire.ts` محول Anthropic الأصلي، و`src/assistant/toolValidation.ts` بوابة الأدوات. أما مسار التنبيهات canonical فيوجد في `src/database/db.ts` مع أدوات Kimo في `src/agent/domainTools.ts` وشاشتي `Offers.tsx` و`Reminders.tsx`.

## المراجع الرسمية

[1]: https://ai.google.dev/gemini-api/docs/openai "Google Gemini OpenAI compatibility"
[2]: https://ai.google.dev/gemini-api/docs/thought-signatures "Google Gemini thought signatures"
[3]: https://developers.openai.com/api/docs/guides/function-calling "OpenAI function calling"
[4]: https://docs.anthropic.com/en/docs/build-with-claude/tool-use "Anthropic tool use"
[5]: https://docs.litellm.ai/docs/completion/input "LiteLLM input translation"
[6]: https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling "Vercel AI SDK tool calling"
[7]: https://openrouter.ai/docs/guides/overview/models "OpenRouter model capabilities"
[8]: https://ai.pydantic.dev/models/overview/ "Pydantic AI model profiles"
[9]: https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions "DashScope OpenAI-compatible API"
[10]: https://docs.mistral.ai/capabilities/function_calling/ "Mistral function calling"
