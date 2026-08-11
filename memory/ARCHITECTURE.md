# بنية التطبيق — Architecture

ملخص تنفيذي لبنية تطبيق مدير العقارات (Expo / React Native / TypeScript).

## الطبقات
- **الواجهة (screens/components)** — شاشات التطبيق ومكوناته في `src/screens` و `src/components`.
- **المنطق والبيانات (database/services/utils)** — قاعدة البيانات والخدمات والأدوات في
  `src/database` و `src/services` و `src/utils`.
- **المساعد الذكي (agent/assistant)** — منطق agent المحلي في `src/agent` و `src/assistant`
  (يتصل بحزمة "open agent" المستقلة: `/data/data/com.termux/files/home/open agent`).
- **التنسيق (theme/types)** — نظام التصميم والأنواع في `src/theme` و `src/types`.

## ملفات جذرية (موروثة/قديمة)
- `src/agentRun.ts`, `src/executor.ts`, `src/invokeTools.ts`, `src/llm.ts`, `src/history.ts`,
  `src/intent.ts`, `src/persist.ts`, `src/files.ts` — طبقة تنفيذ agent السابقة؛ عند أي تعديل
  تحقق من تداخلها مع المسار الحديث في `src/agent` و `src/assistant`.

## بنية خارجية
- `tile-server.js` — خادم الخرائط محلياً (مع `ecosystem.config.js` لإدارة pm2).
- `schema.sql` (في `~/`) — مخطط قاعدة البيانات.
- حزمة "open agent" — مكتبة TypeScript تُبنى ضمن `node_modules` للتطبيق.

## قواعد معروفة
- فحص TS: `node node_modules/typescript/bin/tsc --noEmit` من داخل `my-app`.
- الذاكرة: `memory/` — راجع `memory/INDEX.md`.
