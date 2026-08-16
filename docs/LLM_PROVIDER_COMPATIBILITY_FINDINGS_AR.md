# نتائج تشخيص توافق المزودات وكيمو

## العطل المرئي

يظهر Gemini خطأ 400 بعد تنفيذ `current_local_time`: `Function call is missing a thought_signature in functionCall parts`. السبب أن رد Gemini عبر واجهة OpenAI-compatible يحتوي التوقيع في `assistant.tool_calls[*].extra_content.google.thought_signature`، لكن عقد الرسائل الحالي لا يعرّف هذا الحقل صراحة ولا يضمن حفظه وإعادته حرفياً في كل جولة.

## نتائج مراجعة الكود

1. `src/assistant/llm.ts` يجمع الحقول الإضافية في `ToolCall.extra`، لكنه يعيد بناء النداء في `toWireToolCall` ويضع `thought_signature` داخل `function`، وهو موضع غير صحيح لواجهة Gemini OpenAI-compatible؛ الموضع الصحيح هو `tool_call.extra_content.google.thought_signature`.
2. `messagesToLlm` ينظف `function` لكنه لا يمر عبر محول مزود يحدد موضع الحقول الخاصة بالمزود.
3. `normalizeToolCallId` يغيّر كل معرف غير مؤلف من 9 محارف إلى معرف جديد. هذا يضر بعقد OpenAI/Gemini الذي يتطلب إعادة إرسال معرف النداء نفسه في رسالة `tool`.
4. البث يرسل `toolCalls` إلى callback دون `extra`، وهو نقص في حالة الاعتماد على delta لتسجيل حالة النداء.
5. `providerCapabilities` يعرّف دعم الأدوات والبث فقط ولا يعرّف عقد الرسائل أو الصوت أو التوقيعات.
6. `expo-audio` غير مثبت حالياً في `package.json` رغم وجود دعم مسجل في بعض إعدادات المشروع؛ لذلك لا يوجد إدخال صوتي فعلي في شاشة المحادثة.

## القرار المعماري

سيُستخدم عقد داخلي واحد للرسائل، ثم محول سلكي لكل عائلة مزود:

- OpenAI-compatible العام: يحافظ على `assistant.tool_calls` و`tool_call_id` كما وردا، ولا يضيف حقول Gemini.
- Gemini OpenAI-compatible: يحافظ حرفياً على `extra_content.google.thought_signature` على مستوى tool call، مع دعم توقيعات واردة بأشكال بديلة في السجلات القديمة وتحويلها إلى الموضع الصحيح فقط.
- Custom: لا يرسل حقولاً خاصة عشوائية في الطلب الأول، لكنه يعيد أي `extra_content` خاص بالمزود إذا أعاده المزود نفسه في نداء لاحق.

لن تُستخدم قاعدة 9 محارف للمعرفات. يُحفظ المعرف الأصلي غير الفارغ، ويُولّد معرف ثابت فقط عند غيابه.

## الصوت

سيُضاف `expo-audio` للتسجيل المحلي بصيغة M4A، ويُرسل الصوت كـ `input_audio` فقط عندما يثبت جدول القدرات أن الموديل يدعم فهم الصوت عبر Chat Completions. الموديلات غير المدعومة لا يُرسل إليها payload صوتي غير صالح؛ يعرض التطبيق للمستخدم سبب المنع ويتيح له إرفاق التسجيل محلياً أو اختيار موديل صوتي.

المراجع: [وثائق Google Function Calling](https://ai.google.dev/gemini-api/docs/function-calling)، [وثائق Google OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai)، [وثائق Google Thought Signatures](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/thought-signatures)، [وثائق Expo Audio](https://docs.expo.dev/versions/latest/sdk/audio/).

## مصفوفة المعايير النهائية للمزودات

| المزود | الواجهة العملية الحالية في التطبيق | قاعدة tool calls | Metadata خاصة | سياسة المحول |
|---|---|---|---|---|
| Gemini | OpenAI-compatible Chat Completions | `assistant.tool_calls` ثم `tool` مع `tool_call_id` | `extra_content.google.thought_signature` عند نماذج Gemini التفكير | يُحفظ التوقيع ويعاد في موضعه الصحيح؛ لا يخرج إلى مزود آخر |
| OpenAI | Chat Completions | `assistant.tool_calls` ثم `tool` | لا تُضاف حقول Gemini | payload قياسي فقط، ومعرف النداء الأصلي كما هو |
| Mistral | Mistral Chat Completions/OpenAI-style | `assistant.tool_calls` ثم `tool` مع `tool_call_id` | الحقول غير المعروفة مرفوضة في بعض النماذج، كما ظهر في خطأ `extra_forbidden` | payload صارم بلا `extra_content` أو حقول دخيلة |
| DashScope/Qwen | OpenAI-compatible Chat Completions | `assistant.tool_calls` ثم `tool` | بعض العائلات تحتاج خيارات إضافية معلنة مثل `tool_stream`؛ لا تُرسل افتراضياً | محول DashScope يضيف الخيار فقط للموديلات المطابقة، ويبقي الأدوات في كل طلب |
| OpenRouter | OpenAI-compatible Router | الأدوات يجب أن تبقى في الطلب الأول وطلبات النتائج | تختلف القدرات حسب النموذج/المسار | محول OpenRouter قياسي مع بوابة قدرات الموديل، دون metadata عشوائية |
| NVIDIA NIM | OpenAI-compatible vLLM Chat Completions | يدعم streaming وtool calling عند دعم الموديل | لا تُرسل حقول Gemini | محول NIM قياسي مع احترام قدرات الموديل |
| Custom | OpenAI-compatible مفترض فقط | لا يُفترض أكثر من العقد القياسي | لا تُرسل metadata خاصة إلا إذا كان المزود نفسه عائلة Gemini معروفة | محول محافظ يرفض غير المعروف قبل الشبكة |

هذه المصفوفة مبنية على وثائق المزودات الرسمية: توضح وثائق Mistral شكل `tools` و`assistant.tool_calls` و`tool_call_id`، وتوضح وثائق DashScope ضرورة إعادة إرسال `tools` مع طلب نتيجة الأداة، بينما توثق NVIDIA أن مسار NIM Chat Completions مبني على vLLM OpenAI-compatible ويدعم الأدوات عند دعم النموذج. كما توثق Google موضع `thought_signature` الخاص بـ Gemini، وتوثق OpenAI العقد القياسي لـ Chat Completions.[1] [2] [3] [4] [5]

### مراجع

[1]: https://docs.mistral.ai/studio-api/conversations/function-calling "Mistral Function Calling"
[2]: https://www.alibabacloud.com/help/en/model-studio/qwen-function-calling "Alibaba Cloud Qwen Function Calling"
[3]: https://docs.nvidia.com/nim/large-language-models/latest/api-reference.html "NVIDIA NIM API Reference"
[4]: https://ai.google.dev/gemini-api/docs/openai "Gemini OpenAI Compatibility"
[5]: https://developers.openai.com/api/docs/guides/function-calling "OpenAI Function Calling"

## تصحيح مهم في مصفوفة الصوت

توضح وثائق Mistral الرسمية أن `voxtral-small-latest` يدعم محادثة الصوت عبر Chat Completions، وأن صيغة رسالة المستخدم تكون `content` على شكل أجزاء، لكن جزء `input_audio` يحمل Base64 مباشرة في قيمة `input_audio`، وليس كائناً بالشكل `{ data, format }` المستخدم في بعض واجهات OpenAI-compatible. لذلك لا يجوز تمرير صيغة Gemini/OpenAI نفسها إلى Mistral Voxtral؛ يجب أن يملك محول Mistral للصوت serializer مستقلاً، أو يستخدم مسار `audio/transcriptions` لنماذج Voxtral Mini Transcribe عندما يكون المطلوب تفريغاً فقط.[6]

[6]: https://docs.mistral.ai/studio-api/audio/speech_to_text/offline_transcription "Mistral Offline Transcription and Chat with Audio"

توضح وثائق Alibaba Cloud أن Qwen3-ASR في OpenAI-compatible mode يقبل Base64 بصيغة Data URI مع MIME، بينما Qwen3.5-Omni يستخدم `input_audio` بكائن `{ data, format }`، وQwen-Omni يتطلب streaming في حالات الإخراج الصوتي. لذلك عزل محول DashScope محتوى الصوت عن Mistral، ولا تُرسل خيارات الإخراج الصوتي ما لم يطلبها المستخدم ويثبت الموديل دعمها.[7] [8]

[7]: https://www.alibabacloud.com/help/en/model-studio/qwen-asr-api-reference "Qwen ASR API Reference"
[8]: https://www.alibabacloud.com/help/en/model-studio/qwen-omni "Qwen Omni"

وتثبت وثائق OpenAI الرسمية أن Chat Completions الصوتية تستخدم `input_audio: { data, format }` وأن m4a من الصيغ المدعومة في واجهات الصوت، كما تعرض وثائق Gemini الرسمية الصيغة نفسها للتحليل الصوتي عبر OpenAI compatibility. لذلك يبقى تسجيل Android بصيغة m4a صالحاً لهذه العائلتين مع تمرير الامتداد الصحيح؛ أما Mistral فيستخدم Base64 مباشرة داخل `input_audio`، وDashScope Qwen-Omni يستخدم كائن `data/format` ويحتاج Data URI عند تمرير Base64 محلي.[9] [10]

[9]: https://developers.openai.com/api/docs/guides/audio "OpenAI Audio Guide"
[10]: https://ai.google.dev/gemini-api/docs/openai "Gemini OpenAI Compatibility and Audio"
