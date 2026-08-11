# دليل تشغيل مشروع my-app

دليل شامل لإعداد وتشغيل المشروع على بيئة Termux، من التثبيت الأول وحتى حل المشاكل الشائعة.

---

## 1. المتطلبات الأساسية

قبل البدء، تأكد من توفّر الأدوات التالية:

- **Termux**: يُفضّل التثبيت من **F-Droid** بدلاً من متجر Google Play، لأن نسخة Play قديمة وغير مدعومة. حمّل أحدث إصدار من [f-droid.org](https://f-droid.org).
- **Node.js**: الإصدار **20.x** أو أحدث (يُنصح بـ LTS). للتحقق من النسخة:
  ```bash
  node -v
  npm -v
  ```
- **Expo Go**: ثبّت تطبيق **Expo Go** على جهاز Android من متجر Google Play، فهو العميل الذي سيحمّل التطبيق من سيرفر التطوير.
- **اتصال شبكة مشترك**: يجب أن يكون هاتف Termux وجهاز Android على **نفس شبكة Wi-Fi** حتى يتمكّن Expo Go من الوصول إلى Metro Bundler.

> ملاحظة: لا حاجة لتثبيت Android Studio أو محاكي، لأن Expo Go يعمل كعميل مباشر.

---

## 2. التثبيت لأول مرة

اتبع الخطوات التالية لإعداد المشروع من الصفر:

### 2.1 استنساخ المشروع

```bash
cd ~
git clone <repository-url> my-app
cd my-app
```

### 2.2 تثبيت الحزم

```bash
npm install
```

أثناء التثبيت، سيُشغّل المشروع سكربت `postinstall.sh` تلقائياً.

### 2.3 شرح سكربت postinstall.sh

الملف `postinstall.sh` يقوم بـ **patch لملف `WorkerFarm.js`** الموجود داخل حزم Metro. السبب:

- في بيئات Termux، يحدث أحياناً انهيار عند إغلاق أنبوب الاتصال (pipe) أثناء عمل Worker، فتظهر أخطاء مثل:
  ```
  Error: write EPIPE
  ```
- يقوم السكربت بتعديل `WorkerFarm.js` ليتجاهل إشارات `EPIPE` بدلاً من إيقاف العملية بالكامل، مما يجعل Metro أكثر استقراراً على Termux.

إذا فشل الـ patch، ستظهر أخطاء EPIPE متكررة أثناء تشغيل Metro (انظر قسم حل المشاكل).

---

## 3. تشغيل Metro Bundler

يوفّر المشروع ثلاث طرق لتشغيل سيرفر التطوير.

### 3.1 الطريقة العادية

تشغيل مباشر في الواجهة الحالية:

```bash
npm start
```

لإيقاف السيرفر: اضغط `Ctrl + C`.

### 3.2 التشغيل على الشبكة المحلية (LAN)

إذا واجهت مشكلة في اكتشاف Expo Go للسيرفر عبر الشبكة المحلية، يمكنك إجبار Metro على الإعلان عن عنوان LAN:

```bash
npm run start:lan
```

### 3.3 التشغيل عبر pm2 (موصى بها) ⭐

هذه هي الطريقة **الموصى بها** لأن pm2 يُبقي Metro يعمل في الخلفية، يحميه من الانهيار التلقائي، ويسهّل مراقبة السجلات.

أوامر الإدارة:

```bash
# تشغيل Metro في الخلفية
node node_modules/pm2/bin/pm2 start start-metro.sh --name metro

# عرض حالة العمليات
node node_modules/pm2/bin/pm2 status

# عرض السجلات (logs) مباشرة
node node_modules/pm2/bin/pm2 logs metro

# إعادة تشغيل Metro
node node_modules/pm2/bin/pm2 restart metro

# إيقاف وحذف عملية Metro
node node_modules/pm2/bin/pm2 delete metro
```

> السبب في استخدام `node node_modules/pm2/bin/pm2` بدلاً من `pm2` مباشرة هو أن Termux لا يضيف مجلد `node_modules/.bin` إلى PATH تلقائياً.

---

## 4. الاتصال من Expo Go

بعد تشغيل Metro، تحتاج إلى إدخال عنوان السيرفر يدوياً في تطبيق Expo Go.

### 4.1 إيجاد عنوان IP الخاص بـ Termux

استخدم إحدى الأمرين التاليين:

```bash
ifconfig
```

أو:

```bash
ip addr
```

ابحث عن عنوان IPv4 لشبكة Wi-Fi، غالباً يبدأ بـ `192.168.x.x` أو `10.x.x.x`.

### 4.2 إدخال الرابط في Expo Go

1. افتح تطبيق **Expo Go** على Android.
2. اضغط على **"Enter URL manually"**.
3. أدخل الرابط بالشكل:
   ```
   exp://192.168.1.100:8081
   ```
   (استبدل `192.168.1.100` بعنوان IP الفعلي لجهازك).

> تأكد أن جهاز Android وهاتف Termux على **نفس شبكة Wi-Fi**.

---

## 5. حل المشاكل الشائعة

### 5.1 "Metro already running"

عند محاولة تشغيل Metro بينما هو يعمل بالفعل، ستظهر رسالة خطأ. الحل:

```bash
# البحث عن العمليات العاملة على المنفذ 8081
pgrep -f "metro"

# قتل جميع العمليات (force kill)
pkill -f "metro"
```

أو عبر pm2:

```bash
node node_modules/pm2/bin/pm2 delete metro
```

### 5.2 انهيار EPIPE

إذا ظهر الخطأ:

```
Error: write EPIPE
```

فهذا يعني أن ملف `WorkerFarm.js` غير مُعدَّل. أعد تشغيل سكربت الإصلاح:

```bash
bash postinstall.sh
```

ثم أعد تشغيل Metro.

### 5.3 Hot Reload لا يعمل

إذا لم تنعكس التعديلات على التطبيق تلقائياً:

```bash
# مسح ذاكرة التخزين المؤقت لـ Metro و Node
rm -rf node_modules/.cache
rm -rf /tmp/metro-*

# أعد تشغيل Metro
```

في تطبيق Expo Go، يمكنك أيضاً هزّ الجهاز لفتح قائمة المطوّر، ثم اختيار **"Reload"**.

---

## 6. أوامر مفيدة

### 6.1 فحص أنواع TypeScript

تشغيل فحص الأنواع دون إنشاء ملفات output:

```bash
node node_modules/typescript/bin/tsc --noEmit
```

### 6.2 اختبار أن Metro يعمل

تحقق أن سيرفر Metro يستجيب:

```bash
curl http://localhost:8081/
```

### 6.3 اختبار تجميع الـ bundle

جرّب تجميع الـ bundle لنظام Android:

```bash
curl "http://localhost:8081/index.ts.bundle?platform=android&dev=true"
```

إذا عاد النص بادئاً بكلمات مثل `__d(function...` فهذا يعني أن التجميع ناجح.

---

## 7. بنية المشروع

نظرة سريعة على المجلدات الرئيسية:

- **`src/screens/`**: يحتوي على شاشات التطبيق الأساسية (تسجيل الدخول، الإعدادات، إلخ). كل شاشة عادةً ما تكون ملف منفصل قابل للتصدير كمكون React.
- **`src/database/`**: طبقة الوصول إلى البيانات. تحتوي على إعداد قاعدة البيانات المحلية (مثل SQLite/Drizzle)، الجداول، واستعلامات CRUD.
- **`src/screens/MapScreenV2/`**: نسخة مطوّرة من شاشة الخريطة. مجلد منفصل لأنها كبيرة وتحوي مكونات فرعية، hooks مخصصة، ومنطق رسم الخرائط.

> لمزيد من التفاصيل، راجع الكود داخل كل مجلد والتعليقات المرفقة.
