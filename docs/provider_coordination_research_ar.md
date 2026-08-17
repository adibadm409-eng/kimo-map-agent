# بحث توحيد طلبات مزودي الذكاء الاصطناعي

## ملاحظات موثقة من المصادر الأولى

### LiteLLM
المصادر: [الوثائق الرسمية](https://docs.litellm.ai/docs/) و[المستودع](https://github.com/BerriAI/litellm).

يقدم LiteLLM واجهة إدخال وإخراج موحدة فوق عدد كبير من المزودين، لكنه لا يزعم أن البروتوكول الأصلي للمزودات واحد؛ القيمة الأساسية هي وجود طبقة ترجمة لكل provider/endpoint، مع فصل routing وfallback وobservability عن التطبيق. النمط المهم لكيمو هو أن الطلب الداخلي لا يُرسل مباشرة، بل يمر عبر adapter يترجم الحقول ويحوّل أخطاء المزود إلى نموذج موحد.

### Vercel AI SDK
المصدر: [AI SDK Core — Tool Calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling).

يعرّف SDK الأداة داخلياً على شكل اسم ووصف و`inputSchema` ودالة تنفيذ اختيارية، ثم يترك للمزود adapter ترجمة ذلك إلى wire format. كما يتيح strict tool calling عندما يدعمه المزود، لكنه يوضح أن strict mode ليس متاحاً لكل المزودات أو الموديلات وأن التوافق يعتمد على provider/model. هذه نقطة مهمة: تعريف الأداة الداخلي والتحقق المحلي يجب ألا يعتمد على أن كل مزود سيقبل نفس JSON Schema أو نفس الحقول.

## استنتاج أولي

التوحيد الموثوق ليس مجرد تغيير `baseUrl` مع إبقاء payload واحد. الطبقة الصحيحة تتكون من عقد داخلي canonical، وadapter مخصص لكل wire family، وcapability profile لكل provider+model، وvalidator محلي قبل الشبكة، وnormalizer للاستجابة، وحلقة tool-call history تتحقق من matching IDs والاكتمال قبل follow-up. يجب أيضاً الفصل بين أخطاء schema الثابتة وأخطاء الشبكة/الحصة القابلة لإعادة المحاولة.

## بوابات التوجيه والترجمة

### Portkey
المصدر: [Getting Started with AI Gateway](https://docs.portkey.ai/docs/guides/getting-started/getting-started-with-ai-gateway).

يستخدم Portkey model catalog/provider slug مثل `@provider-slug/model-name` كي يبقى كود التطبيق ثابتاً بينما يتغير المزود من خلال catalog. كما يوضح أن نفس gateway يدعم Chat Completions ومزودات لها endpoints أصلية مختلفة مثل Anthropic Messages، ويضيف ميزات routing وfallbacks وbudgets وrate limits وobservability. الدرس العملي لكيمو هو فصل اختيار المزود والاعتماد والقدرات عن payload الداخلي، وعدم جعل `providerId` وحده مسؤولاً عن كل السلوك.

### LiteLLM input translation
المصدر: [Input Params](https://docs.litellm.ai/docs/completion/input).

LiteLLM يقدّم قائمة حقول موحدة ثم يترجمها إلى provider-specific parameters، مع السماح بإرسال parameters خاصة بالمزود بشكل صريح. هذا يثبت أن الطبقة الاحترافية تحتاج registry للحقول: ما هو canonical، وما هو provider-specific، وما الذي يحذف أو يعاد تسميته أو يحول إلى endpoint آخر. لا يكفي تمرير جسم OpenAI كما هو لكل المزودين.

## العقد الأصلي للأدوات

### OpenAI
المصدر: [Function calling](https://developers.openai.com/api/docs/guides/function-calling).

يوضح OpenAI أن دورة tool calling متعددة المراحل: إرسال الأدوات، استقبال tool call، تنفيذ التطبيق، إرسال tool output، ثم استقبال رد نهائي أو tool calls إضافية. كما يوصي `strict: true` عندما يدعمه المزود، مع شروط schema مثل `additionalProperties: false` ووضع كل properties ضمن required، ويمكن تمثيل الاختياري عبر null. هذا يفرق بين canonical validation المحلي وبين strict mode الذي قد لا يقبله كل provider/model.

### Anthropic
محاولة فتح الرابط الرسمي `https://docs.anthropic.com/en/docs/build-with-claude/tool-use` أعادت صفحة region unavailable في browser، لذلك لم أستخدمها كمرجع نهائي. يلزم لاحقاً الاستناد إلى نسخة docs قابلة للاستخراج أو وثائق AWS/المستودع الرسمي إن احتجنا إدخال Anthropic ضمن نطاق Kimo.

## تفاصيل adapters والـnormalization

### LiteLLM function calling
المصدر: [Function Calling](https://docs.litellm.ai/docs/completion/function_call).

يوفر LiteLLM فحصاً منفصلاً لدعم function calling ودعم parallel function calling على مستوى الموديل، ولا يفترض أن كل موديل يملك القدرة نفسها. المثال الرسمي يحفظ رسالة assistant التي تحمل كل tool calls، ثم يضيف نتائج كل call برسالة tool تحمل `tool_call_id`، ثم يرسل الجولة التالية. كما يحذر من أن JSON arguments قد لا تكون صالحة دائماً، ما يفرض parse/validation محلياً قبل التنفيذ.

### Vercel Language Model Specification
المصدر: [Writing a Custom Provider](https://ai-sdk.dev/providers/community-providers/custom-providers).

يعرّف Vercel مواصفة داخلية مستقلة عن wire provider، وفيها `tool-call` يحمل `toolCallId` و`toolName` و`args`، و`tool-result` يحمل `toolCallId` و`toolName` و`result` و`isError`. كما يفصل system/user/assistant/tool roles ويدعم reasoning/file parts وproviderOptions. هذا نمط قوي لكيمو: canonical message model غني، ثم adapter يترجم إلى OpenAI/Gemini/Mistral وغيرها، ويعيد تطبيع streaming إلى أحداث داخلية لا تعتمد على شكل SSE الخاص بالمزود.

## capability discovery وerror normalization

### LiteLLM exception mapping
المصدر: [Exception Mapping](https://docs.litellm.ai/docs/exception_mapping).

LiteLLM يطبع أخطاء المزودات إلى فئات متناسقة مثل BadRequest/UnsupportedParams، Authentication، NotFound، Timeout، RateLimit، APIConnection، Server، مع الاحتفاظ بـ`provider_specific_fields`. هذا يتيح handler واحداً للتطبيق، لكن دون فقد السبب الأصلي أو status/provider metadata. النمط المطلوب في Kimo هو canonical error يحتوي kind/status/retryable/provider/model/requestId/raw detail، لا مجرد نص عربي.

### OpenRouter model metadata
المصدر: [OpenRouter Models](https://openrouter.ai/docs/guides/overview/models).

OpenRouter يعلن `supported_parameters` لكل موديل، ومنها `tools` و`tool_choice` و`max_tokens` و`structured_outputs` و`reasoning` وغيرها. هذا دليل مباشر على أن capability profile يجب أن يكون per provider+model ويتم تحديثه من model catalog، لا أن يقرر التطبيق أن كل موديلات المزود تدعم كل الحقول.

## ModelProfile كمرجع للتصميم

### Pydantic AI
المصادر: [Model Providers](https://pydantic.dev/docs/ai/models/overview/) و[ModelProfile API](https://pydantic.dev/docs/ai/api/pydantic-ai/profiles/).

يستخدم Pydantic AI `ModelProfile` موحداً يصف قدرات الموديل مثل `supports_tools` و`supports_json_schema_output` و`supports_tool_return_schema` و`supports_audio_input`، ويتيح `json_schema_transformer` لتكييف schema مع الموديل. كما يصف profile كيفية بناء ومعالجة الطلبات والاستجابات لعائلات موديلات مختلفة. هذا أقرب نمط مرجعي لمشكلة Kimo من مجرد `providerCapabilities` الثابتة، لأن profile يجب أن يكون provider+model مع transforms وقيود محددة.

## DashScope / Alibaba Model Studio

المصادر الرسمية: [Qwen API via OpenAI Chat Completions](https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions) و[OpenAI compatibility](https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope).

توضح الوثائق أن DashScope يدعم Chat Completions وtools وtool_choice وparallel_tool_calls، لكن الحقول ليست موحدة لكل الموديلات. `max_tokens` قديم ومتوافق، بينما `max_completion_tokens` مدعوم لعائلات محددة مثل Qwen3.7-Max وQwen3.5-Plus وQwen3.5-Flash وKimi/Kimi/GLM/DeepSeek المحددة. كما أن `tool_stream` و`reasoning_content` و`preserve_thinking` و`enable_thinking` لها قوائم دعم صريحة حسب الموديل. لذلك inference الحالي في Kimo الذي يقرر max token field من regex عامة يحتاج registry أكثر دقة، ويفضل أن يبدأ من `/models` أو catalog metadata، لا من `def.id` فقط.
