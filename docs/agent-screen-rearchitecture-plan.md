# خطة إعادة هندسة شاشة وكيل الذكاء الاصطناعي (UI-Driven-by-Agent)

## 1. الهدف وغير الهدف

**الهدف:** إعادة بناء `src/screens/assistant/AssistantScreen.tsx` من الصفر وفق معايير
«واجهة وكيل محترفة» المُقدَّمة: مترجم فوري لكائنات حالة الوكيل، مكوّنات عديمة العقل
(Dumb Components) مُسجَّلة عبر `ComponentRegistry`، مخزن حالة (Zustand)، `FlashList`،
وشريط سياق مثبّت + شريط حالة تنفيذ + بطاقات موافقة + شبكة أزرار سياقية + سجل عمليات
قابل للطي + شريط إدخال هجين.

**غير الهدف (يُحفظ كما هو):**
- منطق الوكيل الخلفي (`executor.ts`, `agentRun.ts`, `agentContract.ts`, `invokeTools.ts`,
  `llm.ts`, `transcribe.ts`, `providers.ts`) — **لا يُعدَّل بروتوكول الأحداث**؛ نعتمد على
  `AgentEvent`/`VisibleAgentEvent` الموجودة فعلاً (phase, plan, plan_step, skill,
  decision, observation, recovery, tool, ask_user, confirmation, progress, stream,
  file, link, thinking, done, error).
- الأسلاك الحالية: `subscribeAgent`, `sendUserMessage`, `answerAsk`, `answerConfirmation`,
  `cancelAgent`, التنقّل (navigation)، جهات الاتصال، الإملاء الصوتي، المرفقات، وإعدادات
  المزوّد — تبقى تعمل كما هي، تُنقل إلى المعمارية الجديدة لا تُحذف.
- ملف `.ts` لخطوط الأدوات/الخريطة/العملاء — خارج النطاق.

## 2. قرار الاعتماديات (Dependency Decision) — نقطة حرجة

المواصفة تمنع `FlatList` وتشترط `FlashList` + `Reanimated v3` + `Zustand`. الواقع
(موثّق عبر فحص `package.json`):
- `@shopify/flash-list` **مثبّت مسبقاً** (موجود في dependencies) — لا حاجة لإعادة تثبيت.
- `zustand` **غير مثبّت** — يُضاف (JS صرف، آمن).
- `react-native-reanimated` **خطره الأعلى**: وحدة أصلية تحتاج إعداد babel plugin
  وترجمة native، وقد تكسر بناء Android على خط التجميع الحالي (Termux + EAS/GitHub Actions).

**القرار الموصى به (آمن للبناء):**
- نثبّت `zustand` فقط. نعتمد `@shopify/flash-list` الموجود فعلاً.
- نستخدم `Animated`/`LayoutAnimation` المدمجين في `react-native` بدل `Reanimated`
  لتفادي كسر البناء الأصلي؛ نوثّق هذا الانحراف صراحةً (الحركات أبسط لكن مطابقة بصرياً).
- **لا نثبّت `react-native-reanimated` إطلاقاً** في هذه المرحلة (انظر §10).

> إن أصرّ المستخدم على Reanimated حرفياً، نضيفه مع `babel.config.js` plugin ونختبر
> عبر GitHub Actions فقط (لا اختبار أصلي محلي).

## 3. المعمارية

### 3.1 مخزن Zustand — `src/screens/assistant/agentChatStore.ts`
يحمل (للجلسة النشطة فقط):
- `messages: ChatItem[]` (مع `uiComponent` و `meta` و `payload`).
- `activeContext: { goal?, budget?, date?, status? }` — يُحدّث من أحداث `plan`/`phase`/`decision`
  بقاعدة أسبقية: `plan.goal` هو المصدر الأساسي للهدف؛ `decision` يُحدّث الحقول المطابقة
  فقط (لا يمسح الهدف).
- `executionSteps: AgentStep[]` — المصدر الوحيد لخطوات التنفيذ، يُغذّى من
  `phase`/`plan`/`plan_step`/`tool`/`observation`/`recovery`/`skill`.
- `auditTrail: AuditEntry[]` — سجل زمني بكل الأحداث (للدرج).
- `statusBar: { visible: boolean; steps: string[]; phase: AgentPhase }` — **مشتق عرضي** من
  `executionSteps` + حالة `busy` (لا يُخزَّن مستقلاً لتفادي الازدواج).
- `pending: PendingState | null` (لـ ask_user / confirmation).
- actions: `applyEvent(e)`, `reset()`, `setPending()`, `appendMessage()`.

**قاعدة التدفق الجزئي (Streaming):** عند استقبال `stream` (وليس `done`) تُعدَّل
`content` لآخر عنصر `MessageBubble` في `messages` (دمج)، ولا يُنشأ عنصر جديد لكل جزء.
عند `stream.done` يُثبَّت العنصر.

### 3.2 ComponentRegistry — `src/screens/assistant/registry.tsx`
خريطة `type → Component`. كل مكوّن **عديم عقل**: يستقبل `props` ويطلق `onEvent(name, payload)`.
المكوّنات المُسجَّلة (تغطي المواصفة + أحداث الوكيل الحالية):
- `MessageBubble` (text/user/assistant) — uiComponent: 'user_bubble' | 'assistant_text'
- `StatusStepper` (#1 شريط الحالة) — من phase/plan/plan_step/progress
- `ContextBanner` (#2 رأس السياق الثابت) — من activeContext المشتق
- `ApprovalGate` (#3 بطاقة الموافقة) — من `confirmation`
- `DecisionCard` — من `decision`
- `ObservationCard` — من `observation`/`recovery`
- `ToolStep` — من `tool` (خطوة تنفيذ)
- `ActionGrid` (#5 أزرار سياقية) — من `link`/`file`/actions المرفقة بالرد
- `FileViewer` — من `file`
- `QuickReplies` — من `ask_user`
- `ThinkingDot` — نقطة «يت thinking» صغيرة من `thinking` (تُشغّل/تُطفي StatusBar)
- `ErrorCard` — من `error`
- `CompletionPulse` — من `done` (يحوّل StatusBar→Idle)
- `ChartRenderer`/`SliderInput`/`MapPicker` — مُسجَّلة كـ **stubs**: تُستدعى فقط عندما يحمل
  payload الوكيل حقل `uiComponent: 'chart'|'slider'|'map'` صريحاً (لا يُبث حالياً)؛ حتى ذلك
  الحين تعرض placeholder آمناً. (عقود جاهزة للتوسّع المستقبلي بلا تعديل الـ Registry.)

**لا يوجد if/else في المكوّنات يقرر «إذا قال الوكيل X أظهر Y»** — الـ store يترجم الحدث
إلى `uiComponent` واحد فقط، والـ Registry يعرضه.

### 3.3 تحويل الحدث → عنصر واجهة (في store.applyEvent)
| حدث الوكيل | عنصر الواجهة الناتج |
|---|---|
| `text`/`stream` | `MessageBubble` (assistant_text) — مع دمج الجزئيات (§3.1) |
| `skill` | `ToolStep` (سطر مهارة) داخل `executionSteps` |
| `thinking` | `ThinkingDot` + إظهار StatusBar |
| `phase`/`plan`/`plan_step`/`progress` | تحديث `executionSteps` + `StatusBar` + `StatusStepper` |
| `plan`/`phase`/`decision` | تحديث `ContextBanner` (activeContext) |
| `confirmation` | `ApprovalGate` داخل FlashList |
| `decision` | `DecisionCard` |
| `observation`/`recovery` | `ObservationCard` |
| `tool` | `ToolStep` |
| `ask_user` | `QuickReplies` (inline) |
| `error` | `ErrorCard` |
| `done` | `CompletionPulse` (StatusBar→Idle) + تحديث `activeContext.status` |
| `link`/`file` | `ActionGrid`/`FileViewer` ملحق برسالة الوكيل |
| كل حدث | إدراج في `auditTrail` |

## 4. مخطط الملفات

**جديد:**
- `src/screens/assistant/agentChatStore.ts` (Zustand)
- `src/screens/assistant/registry.tsx` (ComponentRegistry + المكوّنات)
- `src/screens/assistant/components/` (StatusStepper.tsx, ContextBanner.tsx, ApprovalGate.tsx,
  DecisionCard.tsx, ObservationCard.tsx, ToolStep.tsx, ActionGrid.tsx, FileViewer.tsx,
  ChatBubble.tsx, AuditDrawer.tsx, ThinkingDot.tsx, ErrorCard.tsx, CompletionPulse.tsx)
- `src/screens/assistant/useAgentEvents.ts` (يوثّق subscribeAgent → store.applyEvent)

**مُعدَّل:**
- `src/screens/assistant/AssistantScreen.tsx` — يُعاد كتابته كـ «قشرة»: Sticky ContextBanner
  فوق، StatusBar فوق FlashList، FlashList في المنتصف (يرسم عبر Registry)، FAB سجل العمليات،
  HybridInputBar في الأسفل.
  **تحذير حرج للفحص:** فحص `agent_input_surface_invariants.mjs` يبحث نصّياً (`.includes`)
  داخل `AssistantScreen.tsx` عن العلامات: `useAudioRecorder`, `const [attachments`,
  `DocumentPicker`, `handleSend`, `cancelAgent`, `إيقاف التسجيل وإرساله`. لذلك **تُبقى
  هذه العلامات حرفياً داخل ملف AssistantScreen.tsx** (شريط الإدخال الهجين يُعرَّف كدالة
  مكوّن محلية داخل نفس الملف، لا كوحدة منفصلة) لئلا يفشل الفحص. الوظائف الأخرى
  (التنقّل، جهات الاتصال، الإعدادات) تبقى في نفس الملف.
- `package.json` — إضافة `zustand` فقط (flash-list موجود مسبقاً).

**محذوف/مُفرّغ:** كتلة `useState` المبعثرة + معالج `subscribeAgent` المضمّن في الشاشة الحالية
تُنقل إلى store/registry (لا حذف للوظائف، فقط نقل معماري).

## 5. العناصر الستة حسب المواصفة (التوزيع المكاني)

| # | العنصر | الموضع | السلوك |
|---|---|---|---|
| 1 | Execution Status Bar | أسفل ContextBanner، فوق FlashList | يظهر أثناء التفكير فقط؛ يختفي (Idle) ويتحوّل لنقطة ملوّنة |
| 2 | Sticky Context Header | أعلى أعلى، مثبّت دائماً | يتقلّص ديناميكياً عند التمرير السريع |
| 3 | Approval Card / بطاقات | داخل FlashList | ظل + حواف تحذيرية؛ Auto-scroll إليها عند ورودها |
| 4 | Audit Trail (FAB + Drawer) | FAB أسفل يمين فوق الإدخال | درج ينزلق من **الحافة اليمنى للشاشة** (edge="right" ثابتاً كما في المواصفة، بغض النظر عن اتجاه RTL) 60% عرض، لا يحجب المحادثة |
| 5 | Contextual Action Buttons | ملحق برسالة الوكيل داخل FlashList | Row أفقي تحت النص |
| 6 | Hybrid Input Bar | أسفل مثبّت | 📎 مرفقات، 🎤 إملاء، ⚡ أوامر؛ KeyboardAvoidingView |

## 6. التدفق اللحظي (يطابق سيناريو المواصفة)
1. إرسال → فقاعة مستخدم فورية + قفل الإدخال + `sendUserMessage`.
2. الوكيل يبث `phase`/`progress` → StatusBar ينزلق + ContextBanner يتقلّص.
3. `confirmation` → ApprovalGate تُدرج + Auto-scroll سلس إليها (في متناول الإبهام).
4. «تأكيد» → `answerConfirmation` → الوكيل يبث `phase`/`decision` → تحديث ContextBanner
   + اختفاء StatusBar + ظهور `ActionGrid` **كصف أفقي ملحق مباشرة أسفل فقاعة رد الوكيل**
   (لا كفقاعة مستقلة) + وميض FAB السجل (تأثير نبضة عبر `Animated` مدته 1.2ث).

## 7. الحفاظ على الفحوصات (Invariants)
- `agent_input_surface_invariants.mjs` يتطلب نصوصاً في الشاشة: `useAudioRecorder`,
  `const [attachments`, `DocumentPicker`, `handleSend`, `cancelAgent`, `إيقاف التسجيل وإرساله`
  → تبقى جميعها في `HybridInputBar`/الشاشة الجديدة.
- `audio_input_invariants.mjs` يتطلب `profile.supports.inputAudio`, `input_audio:{data,format}`,
  `expo-audio` → لا علاقة بمعمارية العرض؛ تبقى سليمة (الإصلاح السابق محفوظ).
- `screen_catalog` و`contact_button` لا تلمسان AssistantScreen → غير متأثرة.

## 8. خطوات التنفيذ (مرحلية)
1. `npm i zustand @shopify/flash-list` + تثبيت محلي (npm ci بأنواع حقيقية).
2. `agentChatStore.ts` (Zustand + applyEvent + خريطة حدث→uiComponent).
3. مكوّنات `components/` (Dumb) واحداً تلو الآخر مع تطبيق DESIGN.md (tokens, Tajawal,
   ألوان دلالية، شبكة 4pt، عمق مسطّح).
4. `registry.tsx` يسجّل المكوّنات.
5. `useAgentEvents.ts` يربط `subscribeAgent` بالـ store.
6. إعادة كتابة `AssistantScreen.tsx` كقشرة (Sticky + StatusBar + FlashList + FAB + InputBar)
   مع نقل أسلاك التنقّل/الصوت/المرفقات/الإعدادات.
7. التحقق: `tsc --noEmit` (heap 4096) + `eslint src audit --max-warnings 0` +
   `npm run test:invariants` (خاصة agent_input_surface + audio_input).
8. دفع وتشغيل بناء GitHub Actions حتى النجاح.

## 9. المخاطر
- **R1 (حرج):** إضافة Reanimated يكسر البناء → نتجنّبه (نستخدم Animated المدمج).
- **R2 (مهم):** فقدان أسلاك الصوت/المرفقات أثناء النقل → نحتفظ بالعلامات المطلوبة للفحص.
- **R3 (مهم):** FlashList يتطلب عناصر متغايرة (heterogeneous) → نُعرّف `getItemType`
  (يرجع `uiComponent`) و `overrideItemLayout` لكل نوع مع حدّ أدنى/أقصى ارتفاع، لا نكتفي
  بـ `estimatedItemSize` وإلا تلفّت البطاقات/فراغات.
- **R4 (مقترح):** تباعد بصري بين العناصر — نطبّق قاعدة «لا فجوات فارغة» عبر هوامش 4/8/12/16.

## 10. التحقق
- **لا تُثبّت `react-native-reanimated`** إطلاقاً في هذه المرحلة (نستخدم Animated المدمج).
- tsc 0 أخطاء، eslint 0 تحذيرات، كل الفحوصات الثابتة PASS، بناء GitHub Actions success.
- **فحص ربط FlashList الأصلي:** بعد `npm install` نتأكد من ارتباط الوحدة عبر بناء
  GitHub Actions (ولا نعتمد على نجاح الـ lint وحده). إن لزم نُشغّل بناء APK تجريبي
  للتأكد من عدم تعطّل الشاشة (شاشة بيضاء/blank).
- اختبار يدوي (عبر EAS بناء APK): إرسال رسالة صوتية + رؤية StatusBar/ContextBanner/
  ApprovalGate/ActionGrid/AuditDrawer تتصرف حسب السيناريو، والتأكد من أن فحص
  `agent_input_surface` لا يزال PASS (العلامات موجودة نصّياً في AssistantScreen.tsx).
