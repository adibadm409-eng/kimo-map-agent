# توحيد طلبات مزودي الذكاء الاصطناعي وبناء طبقة تنسيق موثوقة لـ Kimo

**المؤلف:** Manus AI  
**نطاق التقرير:** OpenAI-compatible Chat Completions، tool calling، streaming، multimodal input، thought/reasoning metadata، capability discovery، retries، وagent history.  
**المشروع محل المطابقة:** `property-manager-app`، الفرع `production-hardening-local`.

## الخلاصة التنفيذية

النتيجة الأساسية للبحث هي أن عبارة **OpenAI-compatible** تعني غالباً توافقاً في نقطة النهاية العامة وأسماء الحقول الأساسية، ولا تعني أن المزودات تشترك في عقد دلالي واحد. فـGemini يضيف متطلبات thought signatures وتسلسلاً خاصاً عند استدعاء الأدوات، وDashScope يحدد دعم الحقول مثل `max_completion_tokens` و`tool_stream` و`reasoning_content` حسب الموديل، بينما يعلن OpenRouter صراحةً `supported_parameters` لكل موديل. لذلك فإن إرسال جسم OpenAI واحد إلى كل المزودات ليس حلاً إنتاجياً، حتى لو نجح في طلب نصي بسيط. [1] [2] [3]

الحل المستخدم عملياً في المشاريع الناضجة ليس محولاً واحداً ضخماً ولا سلسلة `if/else` مبنية على اسم المزود فقط. الحل هو فصل أربع طبقات: **عقد داخلي canonical** لا يعرف wire format، و**ملف قدرات Model Profile لكل provider+model**، و**adapter مستقل لكل عائلة wire**، و**دورة تطبيع للاستجابة والتاريخ والأخطاء**. هذا النمط ظاهر بصيغ مختلفة في LiteLLM وVercel AI SDK وPydantic AI وPortkey. [4] [5] [6] [7]

وبالنسبة لتطبيقك المحلي، لا أوصي بإضافة بوابة سحابية مثل Portkey أو LiteLLM Gateway، لأن ذلك يخالف شرط التشغيل المحلي ويضيف نقطة فشل وطبقة ثقة جديدة. أوصي بإنشاء **Local Provider Coordination Layer** داخل التطبيق، مستوحاة من أفكار هذه المشاريع، مع إبقاء مفاتيح المزودات والبيانات محلية، وجعل كل طلب يمر عبر capability resolution وschema validation وwire serialization وresponse normalization قبل أن يصل إلى executor.

> **الحكم المهني:** طبقة `providerWire.ts` الحالية خطوة صحيحة، لكنها ليست بعدُ طبقة تنسيق إنتاجية كاملة؛ لأنها لا تزال تستنتج قدرات كثيرة من regex وprovider id، ولا تملك عقداً داخلياً غنياً بما يكفي، ولا تتحقق من صحة دورة tool-call history قبل follow-up، ولا تحفظ model metadata الفعلية من catalogs.

## ما الذي توحّده المشاريع الصناعية فعلاً؟

توضح الحلول المنشورة أن التوحيد الناجح يقع في المستوى الداخلي، لا في إجبار المزودات على نفس wire payload. LiteLLM يعرّف مجموعة مدخلات موحدة ثم يترجمها إلى parameters خاصة بالمزود، ويمدّد ذلك إلى exception mapping وmodel capability checks. [4] [8] Vercel AI SDK يفصل `tool-call` الداخلي الذي يحمل `toolCallId` و`toolName` و`args` عن صيغة كل مزود، ويضع provider-specific options في مساحة منفصلة. [5] Pydantic AI يستخدم `ModelProfile` يصف دعم الأدوات وJSON schema والصوت، ويتيح `json_schema_transformer` لكل عائلة موديلات. [6]

| الحل | ما الذي يقدمه فعلياً | ما الذي ينبغي استعاره في Kimo | ما لا يناسب تطبيقك المحلي |
|---|---|---|---|
| **LiteLLM** | واجهة موحدة، ترجمة parameters، فحص دعم function/parallel calling، وتوحيد الأخطاء مع الاحتفاظ بتفاصيل المزود | canonical request، model capability checks، error taxonomy، واختبارات provider matrix | Gateway Python/خدمة وسيطة خارج تطبيق Expo إذا أضيفت كما هي |
| **Vercel AI SDK** | Language Model Specification، typed tool calls/results، فصل provider adapter عن agent loop، وتحقق schema | نموذج رسائل داخلي غني، `toolCallId` كمعرف ارتباط، stream event normalization، وschema validation | الاعتماد على runtime Node أو Gateway خارجي داخل تطبيقك |
| **Pydantic AI** | `ModelProfile` لكل موديل، schema transformers، وفصل capabilities عن provider class | profile يحتوي supports_tools/vision/audio/parallel/strict وtransforms مع مصدر وثقة | طبقة Python كاملة داخل APK |
| **Portkey** | catalog، routing، fallback، rate limits، observability، وأخطاء موحدة عبر gateway | مفهوم profile/catalog وerror contract وسياسة fallback | خدمة سحابية، credentials خارجية، واعتماد شبكي إضافي |
| **OpenRouter** | catalog معلن فيه `supported_parameters` لكل موديل | capability discovery وعدم إرسال tools أو max-token field دون إثبات | اعتباره دليلاً عاماً لكل المزودات؛ metadata خاص بـOpenRouter فقط |

## العقود المختلفة التي يجب ألا تُخلط

### عقد الأداة والـschema
في OpenAI يمكن تفعيل `strict`، وله شروط على JSON Schema مثل `additionalProperties: false` وجعل الخصائص المطلوبة صريحة، بينما يظل strict mode غير متاح أو مختلفاً في مزودات أخرى. [1] DashScope يقبل tools وtool_choice وparallel_tool_calls، لكنه يحدد طول الاسم وقواعد schema وبعض الحقول حسب الموديل. [3] لذلك يجب أن يملك Kimo schema داخلياً canonical، ثم يحوله adapter إلى schema مقبول للموديل، مع إمكانية حذف strict أو تبسيط union/nullable عند عدم الدعم.

### عقد tool-call history
المعيار الداخلي يجب أن يحافظ على رسالة assistant التي تحتوي **كل** tool calls، ثم يضع نتائج الأدوات مرتبطة بـ`tool_call_id`. هذا هو النمط الذي توضحه أمثلة OpenAI وLiteLLM وVercel. [1] [4] [5] لا يجوز تنفيذ call ثم إضافة نتيجته قبل حفظ بقية calls في نفس الدفعة إذا كان المزود يفرض ترتيباً معيناً.

Gemini 3 يفرض قاعدة أكثر حساسية: في parallel function calls تكون signature غالباً في أول call فقط، ويجب إرسال كل calls أولاً ثم كل results بعدها، وعدم interleave. كما أن `skip_thought_signature_validator` مسموح فقط كحل أخير عندما تكون call قد جاءت من تاريخ لم يولده Gemini. [2] هذه القاعدة تجعل حقن sentinel في كل Gemini assistant call سياسة غير آمنة؛ يجب ربطه بعلامة `legacySynthetic` صريحة.

### عقد streaming
لا يكفي جمع `data:` وتحويله إلى نص. يجب تطبيع أحداث البث إلى أحداث داخلية مثل `text_delta` و`tool_call_delta` و`reasoning_delta` و`usage` و`completed` و`stream_error`. Vercel يضع هذا الفصل في Language Model Specification، بينما توضح وثائق DashScope أن stream chunks قد تحمل tool information وusage في النهاية. [3] أي خطأ JSON في SSE يجب أن يميّز بين chunk غير مكتمل، event غير معروف يمكن تجاهله، وstream تالف يستحق فشلاً واضحاً.

### عقد الأخطاء
LiteLLM يفرق بين BadRequest/UnsupportedParams، Authentication، NotFound، Timeout، RateLimit، APIConnection، وServer، مع الاحتفاظ بـprovider-specific fields. [8] يترتب على ذلك أن Kimo يجب ألا يعرض للمستخدم رسالة عامة مثل “فشل الاتصال” عندما يكون السبب `400 extra_forbidden` أو `429 quota`. كما يجب ألا يعيد المحاولة على schema error أو authentication error، ولا يعيد إرسال tool call قابل لتنفيذ أثر جانبي بسبب fallback مبهم.

## فجوات Kimo الحالية مقارنة بالنمط الإنتاجي

| الأولوية | الفجوة الحالية في الكود | الأثر العملي | الإصلاح المطلوب |
|---|---|---|---|
| **P0** | `providerCapabilities()` في `providers.ts` يستنتج `supportsParallelTools` تقريباً لكل مزود غير custom، ويستنتج `maxTokensField` من regex عامة | نفس الطلب قد يولد parallel calls أو يرسل field غير مدعوم لموديل بعينه | Model Profile فعلي لكل provider+model، مع `source`, `confidence`, `supportedParams`, وpolicy افتراضية تمنع parallel |
| **P0** | `providerRequestIssues()` يتحقق من وجود id/name/arguments لكنه لا يتحقق من matching tool results، duplicate ids، missing results، ترتيب calls/results، أو أسماء الأدوات | follow-up صالح شكلياً لكنه مرفوض من المزود، خصوصاً Gemini وMistral | `validateToolTurn()` قبل كل follow-up، مع contract errors محلية قبل الشبكة |
| **P0** | `parseToolArgs()` يعيد `{}` عند JSON غير صالح | قد تُنفذ أداة بوسائط فارغة أو defaults بدلاً من إيقاف التنفيذ وإصلاح النداء | parser يعيد `invalid_tool_arguments`، ولا ينفذ الأداة قبل schema validation؛ يرسل tool error مضبوطاً للموديل |
| **P0** | `serializeToolCall()` يحقن `skip_thought_signature_validator` تلقائياً في أول Gemini call غير موقعة | قد يخفي فقدان signature حقيقية ويضعف أداء Gemini 3 أو يسبب رفضاً حسب مسار المزود | لا sentinel إلا لنداء موسوم legacy/synthetic؛ إذا كان call مولداً من Gemini وفقد signature فشل محلي واضح |
| **P1** | `buildChatRequestBody()` لا يرسل `parallel_tool_calls` ولا يملك policy صريحة لـtool_choice أو strict | المزود قد يختار parallel لا يستطيع executor أو الموديل التالي إعادة بثه | policy داخلية `parallel: deny|allow`; أرسل field فقط إذا profile يثبت دعمه، وإلا امنعها أو نفذ single-call mode |
| **P1** | `providerWireRequestExtras()` يضع `tool_stream: true` لعائلة GLM بالاسم فقط | قد يُرسل extra غير مدعوم لموديل GLM أو Qwen لا يطابق القائمة الرسمية | extras registry بمدى موديل موثق، واختبار snapshot لكل extra |
| **P1** | `filterChatModels()` يستبعد أي اسم يحتوي `audio` أو `speech`، رغم أن settings تعلن دعم audio models | موديلات الصوت قد تختفي من القائمة ولا يمكن اختيارها، أو يتناقض دليل الدعم مع catalog | لا تستخدم filter اسمي لمنع audio؛ خزّن modality metadata وافصل chat model عن transcription endpoint |
| **P1** | `fetchProviderModels()` يعيد string[] فقط | تضيع `supported_parameters` وmodalities وcontext limits ولا يمكن بناء profile دقيق | `fetchProviderModelProfiles()` يعيد raw metadata + normalized profile، مع cache محلي ووقت تحديث ومصدر |
| **P1** | `postChatStream()` يعامل أي exception من reader كـparse، ويعود إلى non-stream بعد استهلاك جزئي محتمل | duplicate requests، تكرار أحداث UI، تكلفة إضافية، واحتمال إعادة تشغيل مسار غير idempotent | fallback فقط قبل استهلاك أي event وبعد فحص content-type؛ بعد بدء stream يعلن stream failure ولا يعيد الطلب تلقائياً |
| **P1** | تجميع اسم tool call في stream يتم بـ`acc.name += tc.function.name` | تكرار الاسم إذا أرسله المزود في أكثر من chunk | name assignment idempotent، بينما arguments فقط هي التي تُجمع بالتسلسل |
| **P2** | `FunctionDef` لا يحمل strict أو schema version أو provider hints | لا يمكن التفريق بين canonical schema وschema بعد التحويل | `CanonicalTool` مع `inputSchema`, `strictPolicy`, `safety`, `sideEffect`, وversion |
| **P2** | `ProviderDef.modelsKind` و`providerWireFamily` لا يملكان provenance أو adapter version | يصعب معرفة لماذا أُرسل field معين وتشخيص drift | trace داخلي لكل طلب: profile id/version، adapter family/version، dropped/transformed fields |

## التصميم المقترح: Local Provider Coordination Layer

### العقد الداخلي canonical

يجب أن يدخل executor إلى طبقة التنسيق بهذا الشكل المفاهيمي، دون أي `extra_content` أو `tool_stream` أو `max_completion_tokens` داخل العقد الداخلي:

```ts
type CanonicalModelRef = {
  provider: ProviderId;
  model: string;
  profileId: string;
  profileVersion: string;
};

type CanonicalTool = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  strict: 'required' | 'preferred' | 'disabled';
  sideEffect: 'none' | 'local_write' | 'local_notification' | 'destructive';
};

type CanonicalMessage =
  | { role: 'system' | 'user'; content: CanonicalPart[] }
  | { role: 'assistant'; content: CanonicalPart[]; toolCalls?: CanonicalToolCall[]; providerState?: ProviderState }
  | { role: 'tool'; toolCallId: string; toolName: string; result: unknown; isError?: boolean };

type CanonicalToolCall = {
  toolCallId: string;
  toolName: string;
  argsText: string;
  args?: unknown;
  providerState?: ProviderState;
  origin: 'model' | 'legacy' | 'synthetic';
};

type CanonicalExecutionPolicy = {
  stream: boolean;
  parallel: 'deny' | 'allow';
  toolChoice: 'auto' | 'none' | { name: string };
  maxOutputTokens?: number;
};
```

`providerState` هو المكان الوحيد الذي يحفظ thought signatures أو reasoning content أو provider-native response fragments. لا يجوز أن تتسرب هذه الحقول إلى Mistral أو OpenAI أو مزود مخصص. وبذلك يصبح حفظ history غير متحيز للمزود، بينما يقرر adapter ما يعاد بثه.

### Model Profile

```ts
type ModelProfile = {
  key: string; // provider:model
  provider: ProviderId;
  model: string;
  wireFamily: ProviderWireFamily;
  source: 'catalog' | 'official_static' | 'user_declared' | 'probe' | 'unknown';
  observedAt: string;
  confidence: 'high' | 'medium' | 'low';
  supports: {
    chat: boolean;
    tools: boolean;
    parallelTools: boolean;
    vision: boolean;
    inputAudio: boolean;
    streaming: boolean;
    strictTools: boolean;
    jsonSchema: boolean;
  };
  supportedParams: Set<string>;
  maxTokensField: 'max_tokens' | 'max_completion_tokens' | 'unknown';
  nativeExtras: Record<string, unknown>;
  schemaTransform: 'none' | 'openai-strict' | 'dashscope' | 'gemini-signature' | 'custom';
};
```

القاعدة التشغيلية هي **fail closed**: إذا كان profile `unknown` فلا ترسل field اختياري غير ضروري. أرسل النص الأساسي فقط، وأرسل tools فقط إذا كانت `supports.tools` مثبتة، وأرسل صورة أو صوتاً فقط إذا كانت modality مثبتة. ويمكن للمستخدم تشغيل “اختبار توافق” يحفظ نتيجة probe محلية، لكن لا يجوز اعتبار probe لموديل واحد دليلاً على كل موديلات المزود.

### واجهة adapter

```ts
interface ProviderAdapter {
  readonly family: ProviderWireFamily;
  validate(request: CanonicalRequest, profile: ModelProfile): ValidationIssue[];
  toWire(request: CanonicalRequest, profile: ModelProfile): WireRequest;
  fromResponse(payload: unknown, profile: ModelProfile): CanonicalResponse;
  parseStreamEvent(event: string, profile: ModelProfile): CanonicalStreamEvent[];
  normalizeError(error: unknown, response?: Response, profile?: ModelProfile): CanonicalLlmError;
  projectHistory(history: CanonicalMessage[], profile: ModelProfile): WireMessage[];
}
```

كل adapter يجب أن يكون قابلاً للاختبار دون executor أو React Native. executor لا يعرف إلا `CanonicalResponse` و`CanonicalToolCall`. لا يجوز أن يقرر executor موضع thought signature أو اسم حقل max tokens.

## سياسة عملية تمنع اختلافات المزودات

يبدأ Kimo افتراضياً بـ`parallel: deny`. هذا ليس تقليلاً من القدرة؛ بل هو وضع أمان للتوافق. إذا كشف profile أن الموديل يدعم parallel، وكان الطلب لا يحتوي أدوات ذات آثار جانبية متعارضة، يمكن رفع السياسة إلى `allow`. عندما يعيد موديل غير مثبت parallel أكثر من call، لا يُنفذ أي call قبل تحقق batch كامل؛ إما أن يعاد الطلب مع parallel disabled أو تُعرض نتيجة تحتاج تدخل المستخدم.

يجب أن تملك كل أداة schema validator محلياً. إذا كانت الوسائط JSON غير صالحة، تُسجل ملاحظة tool-call error وتُرسل نتيجة خطأ منظمة للموديل إن كان المزود يسمح بذلك. إذا كانت الوسائط JSON صالحة لكنها لا تطابق schema، لا تُنفذ الأداة؛ يعاد للموديل خطأ validation محدد أو يطلب Kimo توضيحاً من المستخدم عندما تكون العملية ذات أثر جانبي.

قبل أي follow-up، يجب تطبيق التحققات التالية: كل assistant tool call له id فريد واسم معروف وarguments قابلة للتحليل؛ كل tool result يطابق call واحداً؛ لا توجد نتيجة يتيمة؛ لا توجد نتيجة مكررة؛ ترتيب Gemini هو calls كاملة ثم results كاملة؛ وأي provider metadata يعاد فقط إلى family التي ولدته.

## تصنيف الأخطاء وإعادة المحاولة

| النوع الداخلي | أمثلة | إعادة المحاولة | السلوك |
|---|---|---:|---|
| `invalid_request` | 400 schema، extra_forbidden، missing signature، unsupported parameter | لا | أصلح payload/profile أو اعرض السبب المحلي |
| `auth` | 401/403 | لا | اطلب من المستخدم تحديث المفتاح دون تكرار الطلب |
| `not_found` | 404 موديل أو endpoint | لا | راجع catalog/base URL |
| `rate_limit` | 429 quota/rate | نعم بحذر | backoff محدود، مع إظهار quota وعدم تبديل موديل صامتاً |
| `timeout` | Abort/timeout | نعم مرة أو مرتين | لا تعيد الطلب بعد وصول tool call جزئي إذا كان stream بدأ |
| `network` | DNS/TLS/offline | نعم | backoff مع زر إيقاف |
| `server` | 500/502/503 | نعم | fallback مسجل فقط إذا كان الطلب read-only أو idempotent |
| `parse` | response/SSE غير صالح | لا تلقائياً بعد بدء stream | سجّل raw-safe excerpt واسم adapter |
| `tool_validation` | args غير صالحة أو schema mismatch | لا على الأداة | أرسل repair turn أو اسأل المستخدم |

لا ينبغي أن يكون fallback بين مزودين عشوائياً في دورة وكيل تحتوي write tools أو notifications. إن استُخدم fallback، يجب أن تكون سياسة الجولة واضحة: fallback مسموح قبل أي tool call فقط، أو بعد tool calls فقط إذا كانت كل النتائج محفوظة ولم تُنفذ side effects مزدوجة. أما `testConnection` فيجب أن يرسل طلباً بلا tools ويملك retry budget منفصلاً حتى لا يستهلك quota المستخدم بلا داعٍ.

## خريطة التنفيذ داخل Kimo

| المرحلة | الملفات | التغيير |
|---|---|---|
| 1 | `src/assistant/providers.ts` | تحويل capabilities إلى profile registry مع source/version/TTL وsupported params؛ إبقاء static profiles كـfallback محافظ |
| 2 | `src/assistant/providerWire.ts` | تقسيم adapter إلى validate/toWire/fromResponse/stream parser/history projector؛ إلغاء sentinel التلقائي وربطه بـlegacy origin |
| 3 | `src/assistant/llm.ts` | إضافة `CanonicalRequest` و`parallel/toolChoice/strict`، وإرسال الحقول الاختيارية من profile فقط؛ منع stream fallback بعد partial consumption؛ تصنيف network/parse بدقة |
| 4 | `src/assistant/history.ts` و`src/assistant/persist.ts` | حفظ providerState وorigin وadapter/profile version، ثم إعادة البناء وفق invariants موحدة |
| 5 | `src/assistant/executor.ts` | التحقق المحلي من tool args والـbatch قبل التنفيذ، وعدم تنفيذ call غير معروف أو مكرر، وفصل policy عن provider wire |
| 6 | `audit/` | إضافة contract tests لكل adapter، model-profile tests، stream fault tests، history ordering tests، وlive probes اختيارية بمفاتيح المستخدم |
| 7 | `AgentSettings` | عرض المصدر والثقة والقدرات الحقيقية لكل موديل، بدلاً من قائمة دعم ثابتة تعتمد على الاسم فقط |

## حزمة الاختبارات الضرورية

يجب أن تفشل الاختبارات التالية قبل اعتبار الطبقة إنتاجية:

| الاختبار | الحالة القاسية |
|---|---|
| `profile_capability_gate` | موديل OpenRouter يعلن tools بلا vision؛ يجب حجب الصورة فقط لا الطلب النصي |
| `max_token_field_matrix` | DashScope Qwen حديث وGLM قديم؛ يجب إرسال الحقل الصحيح أو حذف الاختياري |
| `parallel_policy` | مزود يعيد callين رغم policy deny؛ يجب عدم تنفيذ أي side effect قبل القرار |
| `gemini_signature_roundtrip` | signature في أول call فقط، ثم sequential second call؛ يجب حفظ كل signatures المطلوبة دون sentinel غير مبرر |
| `history_ordering` | assistant بثلاث calls ونتائج بترتيب مختلف؛ يجب إعادة ترتيب wire حسب عقد المزود أو الرفض المحلي |
| `duplicate_tool_id` | call id مكرر أو tool result مكرر؛ يجب الرفض قبل الشبكة |
| `invalid_arguments` | arguments مقسومة في SSE أو JSON غير صالح أو schema mismatch؛ لا تُنفذ الأداة |
| `stream_partial_failure` | وصول text/tool chunks ثم انقطاع الشبكة؛ يجب عدم fallback الذي يكرر الطلب تلقائياً |
| `stream_name_idempotence` | name يصل في chunkين؛ يجب ألا يصبح `tooltool` |
| `provider_leak` | thought_signature أو `extra_content` في Gemini history ثم Mistral follow-up؛ يجب حذفها بالكامل |
| `error_taxonomy` | 400/401/404/422/429/500/timeout/network؛ يجب تصنيفها ورسائلها وسياسة retry بدقة |
| `catalog_drift` | catalog جديد يزيل موديل أو يغيّر supported_parameters؛ يجب انتهاء صلاحية profile وإظهار تحذير |
| `custom_provider` | profile unknown؛ يجب إرسال minimal safe payload وعدم الادعاء بدعم tools/audio |

## القرار الموصى به

أوصي بتطبيق النسخة المحلية من هذا التصميم بدلاً من إدخال خدمة سحابية. يمكن الاحتفاظ بـ`providerWire.ts` كنواة، لكن يجب إعادة تعريفه كطبقة adapters كاملة، وإضافة `modelProfiles.ts` و`canonicalMessages.ts` و`toolTurnValidator.ts` و`errorTaxonomy.ts`. كما يجب أن يصبح اختيار parallel والـextras والـstrict قراراً ناتجاً عن profile موثق، لا نتيجة regex عامة.

الترتيب الآمن للتنفيذ هو: أولاً validation/history/error contracts، ثم profile registry وminimal payload policy، ثم adapters وstream parser، ثم parallel enablement الاختياري، وأخيراً live probes. لا ينبغي البدء بإضافة مزيد من المزودات أو بناء APK قبل اجتياز contract tests الجديدة، لأن توسيع القائمة فوق طبقة غير حازمة سيزيد عدد حالات 400 بدلاً من حلها.

## المراجع

[1]: https://developers.openai.com/api/docs/guides/function-calling "OpenAI — Function calling"

[2]: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/thought-signatures "Google Cloud — Thought signatures"

[3]: https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions "Alibaba Cloud Model Studio — Qwen API via OpenAI Chat Completions"

[4]: https://docs.litellm.ai/docs/completion/input "LiteLLM — Input Params"

[5]: https://ai-sdk.dev/providers/community-providers/custom-providers "Vercel AI SDK — Writing a Custom Provider"

[6]: https://pydantic.dev/docs/ai/api/pydantic-ai/profiles/ "Pydantic AI — ModelProfile"

[7]: https://docs.portkey.ai/docs/guides/getting-started/getting-started-with-ai-gateway "Portkey — Getting Started with AI Gateway"

[8]: https://docs.litellm.ai/docs/exception_mapping "LiteLLM — Exception Mapping"

[9]: https://openrouter.ai/docs/guides/overview/models "OpenRouter — Models and supported_parameters"

[10]: https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling "Vercel AI SDK — Tool Calling"
