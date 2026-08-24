# بناء التطبيق مع محرك كيمو المضمَّن (Embedded Build)

هذا المستند يصف كيف يُبنى تطبيق مدير العقارات مع محرك الوكيل البايثوني
مضمَّناً داخله (بلا خادم منفصل). بعد البناء يشارك المحرك قاعدة التطبيق
نفسها (`expo-sqlite`) عبر `kimo_embed.run_chat_sync`.

## المبدأ
- بايثون يعمل داخل معالج التطبيق (Chaquopy على أندرويد، PythonKit على iOS).
- المحرك يفتح ملف قاعدة التطبيق ذاته ويقرأ بيانات المجال ويكتب المحادثة في
  جداول `agent_messages` / `agent_sessions` مباشرةً — مصدر بيانات واحد.
- الواجهة (`executor.ts` ← `kimoNative.ts`) تستدعي الوحدة الأصلية
  `KimoEngine.runChat`؛ إن غابت (تطوير Expo Go) تعود تلقائياً لخادم HTTP.

## خطوات أندرويد (Chaquopy)

1. **تجهيز المشروع الأصلي**
   ```bash
   npx expo prebuild --platform android
   ```

2. **إضافة Chaquopy**
   في `android/build.gradle` (المستودعات والاعتماديات الموحّدة):
   ```gradle
   buildscript {
     repositories { google(); mavenCentral() }
     dependencies {
       classpath 'com.chaquo.python:gradle:15.0.1'   // تحقق من أحدث إصدار
     }
   }
   ```
   في `android/app/build.gradle`:
   ```gradle
   plugins { id 'com.android.application'; id 'com.chaquo.python' }
   android {
     defaultConfig { ndk { abiFilters 'arm64-v8a', 'x86_64' } }
   }
   python {
     version '3.11'
     pip { install 'aiohttp' }   // أي اعتماديات يحتاجها المحرك
   }
   ```
   > أثناء بناء EAS يتوفر اتصال إنترنت لتنزيل حزم بايثون.

3. **مزامنة مصادر المحرك**
   ```bash
   node scripts/sync-kimo-python.mjs
   ```
   ينسخ `kimo/` و`kimo_embed.py` إلى `android/app/src/main/python/`.

4. **تسجيل الوحدة الأصلية**
   - الملف `android/app/src/main/java/com/propertyapp/agent/KimoEngineModule.kt`
     (عدّل اسم الحزمة ليطابق مشروعك).
   - في `MainApplication.java` أضف `new KimoEnginePackage()` إلى قائمة
     `getPackages()`.

5. **تفعيل المحرك داخل التطبيق**
   - في `src/assistant/kimoBridge.ts` اضبط `KIMO_ENGINE_ENABLED = true`.
   - اسم قاعدة البيانات في `src/assistant/kimoNative.ts` (`KIMO_DB_NAME`)
     يجب أن يطابق اسم قاعدة `expo-sqlite` المستخدمة في التطبيق.

6. **البناء**
   ```bash
   npx eas build --platform android --profile production
   ```

## iOS (PythonKit) — توجيه مختصر
- أضف `PythonKit` عبر CocoaPods واربط `libpython`.
- أنشئ وحدة RN أصلية (Swift) تستدعي `kimo_embed.run_chat_sync` وتعيد JSON.
- نسّق نفس عقد `KimoEngine.runChat(sessionId, text, dbName, mock)`.

## التحقق قبل البناء (دون جهاز)
شغّل اختبار التوافق الذي يحاكي ما بعد البناء:
```bash
cd python-agent
python3 examples/integration_build_test.py     # فجوة العرض + الإيقاف/الاستئناف
python3 kimo_embed.py                          # تشغيل مضمَّن بلا خادم
```
يجب أن يكتب المحرك المحادثة في `agent_messages`/`agent_sessions` ويظهر
الجواب بعد إعادة تحميل الواجهة.

## ملاحظات
- الوصول المتزامن: المحرك والواجهة يفتحان نفس ملف SQLite عبر اتصالين؛
  SQLite يتعامل معه عبر القفل/الـWAL. إن لوحظ تعارض، فعند فتح قاعدة
  expo-sqlite فعّل وضع WAL.
- الأسرار (مفاتيح مزوّد LLM) تُمرَّر عبر إعدادات التطبيق (`agent_settings`)،
  لا تُحرق في الكود.
