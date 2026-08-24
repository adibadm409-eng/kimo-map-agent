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
MAIN_APP = os.path.join(
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
            'dependencies {\n        classpath "com.chaquo.python:gradle:15.0.1"',
            1,
        )
    if "maven.chaquo.com" not in s:
        s = s.replace(
            "repositories {",
            'repositories {\n        maven { url "https://maven.chaquo.com" }',
        )
    open(ROOT_GRADLE, "w").write(s)
    print("patched android/build.gradle (chaquopy classpath + repo)")


def patch_app_gradle():
    if not os.path.exists(APP_GRADLE):
        fail("android/app/build.gradle غير موجود")
    s = open(APP_GRADLE).read()
    if "com.chaquo.python" not in s:
        inserted = False
        # أدخل إضافة chaquopy بعد سطر plugin تطبيق أندرويد (مهما كانت صيغته)
        for needle in [
            'id("com.android.application")',
            "id('com.android.application')",
            'id "com.android.application"',
            "id 'com.android.application'",
        ]:
            if needle in s:
                s = s.replace(needle, needle + '\nid("com.chaquo.python")', 1)
                inserted = True
                break
        if not inserted:
            # احتياط: تطبيق صريح في أعلى الملف
            s = 'apply plugin: "com.chaquo.python"\n' + s
    if "python {" not in s:
        s += (
            "\n\npython {\n"
            "    version \"3.11\"\n"
            "    pip { /* kimo uses stdlib only */ }\n"
            "}\n"
        )
    open(APP_GRADLE, "w").write(s)
    print("patched android/app/build.gradle (chaquopy plugin + python block)")


def patch_main_application():
    if not os.path.exists(MAIN_APP):
        fail("MainApplication.java غير موجود")
    s = open(MAIN_APP).read()
    if "import com.realestate.app.agent.KimoEnginePackage;" not in s:
        # أدخل الاستيراد بعد سطر package
        s = s.replace(
            "package com.realestate.app;",
            "package com.realestate.app;\n\nimport com.realestate.app.agent.KimoEnginePackage;",
            1,
        )
    if "new KimoEnginePackage()" not in s:
        if "new MainReactPackage()" in s:
            s = s.replace(
                "new MainReactPackage()",
                "new MainReactPackage(), new KimoEnginePackage()",
                1,
            )
        else:
            fail("لم أجد new MainReactPackage() للتسجيل")
    open(MAIN_APP, "w").write(s)
    print("patched MainApplication.java (registered KimoEnginePackage)")


def copy_native_module():
    os.makedirs(NATIVE_DST_DIR, exist_ok=True)
    shutil.copyfile(NATIVE_SRC, os.path.join(NATIVE_DST_DIR, "KimoEngineModule.kt"))
    print("copied KimoEngineModule.kt ->", NATIVE_DST_DIR)


def copy_python_sources():
    os.makedirs(PY_DST, exist_ok=True)
    kimo_src = os.path.join(ROOT, "kimo")
    kimo_dst = os.path.join(PY_DST, "kimo")
    if os.path.exists(kimo_dst):
        shutil.rmtree(kimo_dst)
    shutil.copytree(kimo_src, kimo_dst)
    shutil.copyfile(
        os.path.join(ROOT, "kimo_embed.py"), os.path.join(PY_DST, "kimo_embed.py")
    )
    print("copied kimo engine ->", PY_DST)


if __name__ == "__main__":
    patch_root_gradle()
    patch_app_gradle()
    patch_main_application()
    copy_native_module()
    copy_python_sources()
    print("CHAQUOPY_PATCH_DONE")
