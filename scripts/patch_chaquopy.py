#!/usr/bin/env python3
"""يطبّق ربط محرك كيمو المضمَّن (Chaquopy) على مشروع أندرويد المولّد بـ expo prebuild.

يشغَّل في CI بعد `npx expo prebuild --platform android`. يعدّل ملفي gradle
ويسجّل الوحدة الأصلية وينسخ مصادر البايثون إلى android/app/src/main/python.
المحرك (kimo) يستخدم stdlib فقط لذا لا حاجة لحزم pip.
"""
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ANDROID = os.path.join(ROOT, "android")
APP_GRADLE = os.path.join(ANDROID, "app", "build.gradle")
ROOT_GRADLE = os.path.join(ANDROID, "build.gradle")
MAIN_APP_KT = os.path.join(
    ANDROID, "app", "src", "main", "java", "com", "realestate", "app", "MainApplication.kt"
)
MAIN_APP_JAVA = os.path.join(
    ANDROID, "app", "src", "main", "java", "com", "realestate", "app", "MainApplication.java"
)
NATIVE_SRC = os.path.join(ROOT, "android-native", "KimoEngineModule.kt")
NATIVE_DST_DIR = os.path.join(
    ANDROID, "app", "src", "main", "java", "com", "realestate", "app", "agent"
)
PY_DST = os.path.join(ANDROID, "app", "src", "main", "python")


def fail(msg):
    print("PATCH_ERROR:", msg)
    sys.exit(1)


def patch_root_gradle():
    if not os.path.exists(ROOT_GRADLE):
        fail("android/build.gradle غير موجود — شغّل بعد expo prebuild")
    s = open(ROOT_GRADLE).read()
    if "com.chaquo.python:gradle" not in s:
        # أضف classpath إلى أول كتلة dependencies (buildscript)
        s = s.replace(
            "dependencies {",
            'dependencies {\n        classpath "com.chaquo.python:gradle:17.0.0"',
            1,
        )
    if "maven.chaquo.com" not in s and "chaquo.com/maven" not in s:
        s = s.replace(
            "repositories {",
            'repositories {\n        maven { url "https://chaquo.com/maven" }',
        )
    open(ROOT_GRADLE, "w").write(s)
    print("patched android/build.gradle (chaquopy classpath + repo)")


def patch_app_gradle():
    if not os.path.exists(APP_GRADLE):
        fail("android/app/build.gradle غير موجود")
    s = open(APP_GRADLE).read()
    if "com.chaquo.python" not in s:
        # نطبّق الإضافة بأسلوب apply plugin (يُحلّ من buildscript classpath
        # المضاف في build.gradle الجذر).
        # ملاحظة: في Chaquopy 16+ اسم بلوك الـ DSL هو chaquopy مع defaultConfig
        # (تحقّقنا من descriptor الجر نفسه)، وليس python كما في النسخ القديمة.
        s += (
            "\n\n// kimo embedded engine (Chaquopy)\n"
            'apply plugin: "com.chaquo.python"\n'
            "chaquopy {\n"
            "    defaultConfig {\n"
            '        version "3.11"\n'
            "    }\n"
            "}\n"
        )
    open(APP_GRADLE, "w").write(s)
    print("patched android/app/build.gradle (apply chaquopy + python block)")


def patch_main_application():
    path = None
    is_kotlin = False
    for p, kt in ((MAIN_APP_KT, True), (MAIN_APP_JAVA, False)):
        if os.path.exists(p):
            path, is_kotlin = p, kt
            break
    if path is None:
        base = os.path.dirname(MAIN_APP_KT)
        listing = os.listdir(base) if os.path.isdir(base) else "<المجلد غير موجود>"
        print("محتوى", base, "->", listing)
        fail("MainApplication (.kt/.java) غير موجود")
    s = open(path).read()
    patched = False

    # 1) سجّل KimoEnginePackage
    if "KimoEnginePackage" not in s:
        if is_kotlin:
            s = s.replace(
                "package com.realestate.app",
                "package com.realestate.app\n\nimport com.realestate.app.agent.KimoEnginePackage",
                1,
            )
            if "packages.apply {" in s:
                s = s.replace(
                    "packages.apply {",
                    "packages.apply {\n      add(KimoEnginePackage())",
                    1,
                )
            else:
                fail("لم أجد packages.apply { في MainApplication.kt")
        else:
            s = s.replace(
                "package com.realestate.app;",
                "package com.realestate.app;\n\nimport com.realestate.app.agent.KimoEnginePackage;",
                1,
            )
            if "new MainReactPackage()" in s:
                s = s.replace(
                    "new MainReactPackage()",
                    "new MainReactPackage(), new KimoEnginePackage()",
                    1,
                )
            else:
                fail("لم أجد new MainReactPackage() للتسجيل")
        patched = True

    # 2) لا نبدأ Chaquopy عند الإقلاع أبداً.
    # تفسير: إن فشل `Python.start` بأسلوب ميت لفشله الأصلي (SIGSEGV/Abort) فإن
    # `try/catch` لا يلتقطه، فكان التطبيق يرتطم قبل إظهار أي شاشة. لذلك أصبح
    # التشغيل بكسلاً داخل `KimoEngineModule` عند أول رسالة للوكيل (هناك يُلتقط
    # أي خطأ بشكل آمن ويُعرض داخل الواجهة).

    open(path, "w").write(s)
    name = os.path.basename(path)
    if patched:
        print(f"patched {name} (KimoEnginePackage + Python.start)")
    else:
        print(f"patched {name} (already patched or skipped)")


def patch_manifest():
    """يضبط extractNativeLibs=true على «application» في AndroidManifest.xml.

    بعض الأجهزة (Samsung/أندرويد 11+) ترتطم بشجرة native عند تحميل مكتبات
    بايثون المضمّنة (kimo) متى كانت المكتبات غير مفهومة على القرص مباشرةً.
    فرض استخراجها على القرص يمنع هذا الانهيار.
    """
    manifest = os.path.join(ANDROID, "app", "src", "main", "AndroidManifest.xml")
    if not os.path.exists(manifest):
        print("WARNING: AndroidManifest.xml not found (skipped extractNativeLibs)")
        return
    s = open(manifest).read()
    if 'android:extractNativeLibs' in s:
        print("manifest already has extractNativeLibs")
        return
    s = s.replace('<application', '<application android:extractNativeLibs="true"', 1)
    open(manifest, "w").write(s)
    print("patched AndroidManifest.xml (extractNativeLibs=true)")


def copy_native_module():
    os.makedirs(NATIVE_DST_DIR, exist_ok=True)
    shutil.copyfile(NATIVE_SRC, os.path.join(NATIVE_DST_DIR, "KimoEngineModule.kt"))
    print("copied KimoEngineModule.kt ->", NATIVE_DST_DIR)


def _ignore_cache(dirname, names):
    return {n for n in names if n in ("__pycache__",) or n.endswith(".pyc")}


def copy_python_sources():
    os.makedirs(PY_DST, exist_ok=True)
    kimo_src = os.path.join(ROOT, "kimo")
    kimo_dst = os.path.join(PY_DST, "kimo")
    if os.path.exists(kimo_dst):
        shutil.rmtree(kimo_dst)
    shutil.copytree(kimo_src, kimo_dst, ignore=_ignore_cache)
    shutil.copyfile(
        os.path.join(ROOT, "kimo_embed.py"), os.path.join(PY_DST, "kimo_embed.py")
    )
    print("copied kimo engine ->", PY_DST)


if __name__ == "__main__":
    patch_root_gradle()
    patch_app_gradle()
    patch_main_application()
    patch_manifest()
    copy_native_module()
    copy_python_sources()
    print("CHAQUOPY_PATCH_DONE")
