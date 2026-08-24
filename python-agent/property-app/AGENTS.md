# AGENTS.md

## Working rules
- Implement exactly the requested task. Do not change, refactor, or "improve" code that is unrelated to the request.
- Before touching a file, read it. Only modify the minimal lines needed for the request.
- Do not break surrounding behavior: after edits, verify the affected features still work (run tsc, harnesses, etc.).
- If a change touches something outside the request's scope, warn the user first instead of silently modifying it.

## قواعد إصلاح الأخطاء (دروس ميدانية مشفّرة)

### 1. قاعدة قمة الجبل الجليدي — لا تنخدع بالأعراض
- العطل الظاهر غالباً **عرض**، وجذره تحت السطح: صياغة الناتج (هروب الحروف داخل
  Template Literals يبتلع `\` ويكسر Regex/JS المرسل للجهاز)، حالات البداية الافتراضية،
  التزامن غير المتزامن، أو أداة فحص كاذبة.
- **لا تصلح الأعراض قبل فحص الناتج الفعلي المرسل للجهاز** (بعد تصريف TS كما في
  `verify.js`) — لا المصدر المقتطع بأسطر، ولا افتراض سلامة ما لم يُشغَّل فعلياً.
- كل فشل غريب في اختبار: تحقق أولاً أن العيب في الاختبار نفسه لا في الإنتاج
  (قيم افتراضية وهمية، نطاقات أسطر انزاحت، استبدالات نصية).

### 2. قاعدة الدومينو — تتبّع ما ينهار خلف كل تعديل
- أي تعديل قد يُزيح نطاقات أسطر أو بنية قالب أو توقيتاً — فتتساقط كل الأدوات المبنية
  عليه (استخراج بـ sed، فحوصات بأرقام أسطر تُقطع أواخرها بصمت).
- خذ في الحسبان من يسكن مع المتغيرات المشتركة: حالة `useState` عند الإقلاع،
  closures الدوال في الرسائل، ترتيب رسائل postMessage (webready/init/setOnline) —
  كل سطر تغيّره قد يكون سنداً لسلوك بعيد لا يراه أحد فوراً.

### ملاحظة تعاونية
- المستخدم يوثّق بشدة؛ عند اكتشاف خطأ جذري وثقّه في `PROBLEMS_LOG.md`، وسجّل
  الفخاخ التي كادت تخدعنا حتى لا تتكرر (راجع الملف قبل كل جولة إصلاح).

## الذاكرة وتتبع التعديلات (Memory & Change Tracking)
- **عند بدء أي جلسة في هذا المشروع**: اقرأ `memory/INDEX.md` أولاً، ثم الملفات
  التي يحتاجها السياق (حسب المهمة: ARCHITECTURE / DECISIONS / SESSION_LOG / CHANGELOG).
- **بعد إنجاز أي مهمة** (تعديل، إصلاح، قرار، فحص): حدّث `memory/SESSION_LOG.md`
  بإدخال بتاريخ وملخص مختصر وملفات متأثرة، وأضف أي قرار جديد إلى
  `memory/DECISIONS.md`. إدخالات `memory/CHANGELOG.md` تُضاف تلقائياً بواسطة
  خطاف git `post-commit` — لا تكررها يدوياً.
- **عند طلب "راجع التعديلات / ما الذي تغيّر"**: اقرأ `git log --oneline -20`
  ثم `git show`/`git diff` للالتزامات المعنية، واربط النتيجة بملف الذاكرة.
- **لا ترفع أبداً**: أسراراً، ملفات `.env*`، أو `memory/` خارج الالتزام (الذاكرة
  جزء من المستودع). قبل أي `git push` افحص `git status`.
- للمراجعات العميقة هناك مهارة `code-review`، وتحميل الذاكرة تلقائياً عبر
  مهارة `project-memory` (في `.opencode/skills/`).