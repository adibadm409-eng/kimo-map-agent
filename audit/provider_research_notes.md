# ملاحظات بحث المزودات — 2026-08-17

## نتائج التصفح الأولي

- نتيجة البحث تشير إلى وثيقة Google الرسمية `https://ai.google.dev/gemini-api/docs/openai` عن OpenAI compatibility في Gemini، وتذكر دعم Gemini 3 لـ thought signatures. محاولة فتحها عبر browser أعادت 403 من Google؛ لم أتعامل مع snippet وحده كمرجع نهائي.
- رابط Mistral الرسمي من نتيجة البحث `https://docs.mistral.ai/studio-api/conversations/function-calling` أعاد توجيهاً إلى `https://docs.mistral.ai/studio/conversations/function-calling` مع عدم توفر screenshot/DOM من browser. يلزم استخدام استخراج نصي أو endpoint رسمي بديل قبل الاعتماد على التفاصيل.

## حدود الاستدلال الحالية

لا توجد حتى الآن قاعدة نهائية مستخرجة من هذه الصفحات. أي إصلاح providerWire يجب أن يُبنى على payloads الفعلية من probes ونتائج API، مع توثيق المصدر الرسمي القابل للقراءة لاحقاً.

## قواعد رسمية مستخرجة من المصادر

### Gemini OpenAI compatibility
المصدر القابل للاستخراج: `https://ai.google.dev/gemini-api/docs/openai`.

- Gemini يقدّم endpoint OpenAI-compatible على `https://generativelanguage.googleapis.com/v1beta/openai/`.
- أمثلة function calling تستخدم الشكل القياسي `tools: [{ type: "function", function: { name, description, parameters } }]` مع `tool_choice: "auto"`.
- وثيقة Gemini تذكر أن Gemini 3 يدعم OpenAI compatibility لـ thought signatures، مع رابط تفصيلي خاص بها؛ يلزم الحفاظ على البيانات الخاصة عند follow-up.
- streaming متاح عبر chat completions.
- الواجهة تدعم content متعدد الأجزاء للصورة و`input_audio` للصوت في النماذج المدعومة.

### Mistral function calling
المصدر: `https://docs.mistral.ai/studio/conversations/function-calling`.

- التسلسل الرسمي هو: system → user → assistant tool call → tool result → assistant، ويمكن أن توجد successive أو parallel tool calls.
- رسالة assistant الواردة من Mistral تُضاف كما هي إلى history، ثم تُرسل رسائل `tool` مع `name` و`content` و`tool_call_id`.
- `tool_choice` يدعم auto/any/none، و`parallel_tool_calls` يدعم التحكم في parallel calls.
- الموديل قد يعيد tool call تالياً بعد نتيجة الأداة، لذلك الحلقة يجب أن تعيد الطلب حتى final answer.
- قائمة function-calling الحالية تشمل عائلات Mistral Large/Medium/Devstral وغيرها، ولا يجوز افتراض أن كل موديل يدعم نفس القدرات.

### OpenAI
المصدر: `https://developers.openai.com/api/reference/chat-completions/overview/`.

- Chat Completions يعتمد messages conversation، لكن الوثيقة الحديثة توصي بمقارنة Responses API للمشاريع الجديدة.
- guides منفصلة تغطي function calling وconversation state وstructured outputs؛ لا ينبغي خلط عقود Responses مع Chat Completions داخل adapter واحد.

## فرضيات التدقيق التالية

1. أي provider adapter يجب أن يعرّف عائلة wire صراحةً ويمنع تسرب الحقول الخاصة بين العائلات.
2. يجب اختبار assistant tool-call message + tool result + follow-up ككتلة واحدة لكل مزود، وليس اختبار request أول فقط.
3. يجب اختبار streaming chunk merge، parallel calls، missing/duplicate tool_call_id، tool result order، وإعادة بناء history بعد persistence.
4. يجب اختبار أن capability gate يعمل حسب provider+model وليس حسب provider فقط.

### OpenRouter
المصدر: `https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion`.

- Chat Completions يعلن `max_completion_tokens` كالحقل الحالي، مع `max_tokens` كحقل deprecated لبعض التوافقات.
- الواجهة تعلن `parallel_tool_calls` و`tool_choice` و`tools` كحقول مستقلة.
- OpenRouter بوابة متعددة النماذج؛ لذلك لا يجوز استنتاج قدرة كل موديل من provider id فقط، ويجب الاستفادة من model metadata / supported parameters متى توفرت.

### Gemini thought-signature rules
المصدران: `https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/thought-signatures` و`https://ai.google.dev/gemini-api/docs/thought-signatures`.

تؤكد الوثيقة الرسمية أن Gemini 3 يرفض بـ400 عند فقد signature مطلوبة. في parallel function calls تكون signature عادة في أول function call فقط، ويجب إرسال كل function calls أولاً ثم كل function responses بعدها؛ لا يجوز interleave. كما أن `skip_thought_signature_validator` مسموح فقط كحل أخير عندما تكون function calls من تاريخ لم يولده Gemini، وقد يضعف الأداء. لذلك لا يصح حقن sentinel بشكل افتراضي في كل Gemini call مولد حديثاً؛ يجب تمييز calls legacy أو غير الموقعة فعلاً.
