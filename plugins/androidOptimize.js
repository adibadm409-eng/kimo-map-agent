const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * تحسينات بناء أندرويد لنسخة الإصدار:
 * 1) فرض minify + shrinkResources (R8) لإخفاء/تشويش الكود الأصلي وتقليل الحجم.
 * 2) تقييد بنى ABI بـ arm64-v8a فقط (الأجهزة الحديثة — 95%+ من الأجهزة النشطة)
 *    لتقليل حجم الـ APK بأقصى حد ممكن. يُطبَّق مباشرةً على سطر abiFilters في
 *    build.gradle (القالب يستخدم ndk { abiFilters (*reactNativeArchitectures()) })
 *    فلا يعتمد على gradle.properties ولا يُنشئ كتلة ndk مكرّرة.
 *
 * محرك JS يبقى Hermes (الافتراضي في RN 0.81) الذي يُحوّل الكود إلى bytecode بدل
 * النص الصريح، ما يحميه من الهندسة العكسية.
 */
module.exports = function androidReleaseOptimize(config) {
  return withAppBuildGradle(config, (cfg) => {
    let s = cfg.modResults.contents;

    // 1) فرض minify + shrinkResources في نسخة release
    if (s.includes('minifyEnabled')) {
      s = s.replace(/minifyEnabled\s+[^\n]+/, 'minifyEnabled true');
    }
    if (s.includes('shrinkResources')) {
      s = s.replace(/shrinkResources\s+[^\n]+/, 'shrinkResources true');
    }

    // 2) تقييد ABI: استبدل سطر abiFilters بـ arm64-v8a فقط، مهما كانت صيغته
    // (القالب يستخدم ndk { abiFilters (*reactNativeArchitectures()) }).
    if (s.includes('abiFilters')) {
      s = s.replace(
        /[^\n]*abiFilters\s*\([^\n]*/m,
        (line) => line.replace(/abiFilters\s*\(.*/, "abiFilters 'arm64-v8a'")
      );
    } else {
      s = s.replace(
        /defaultConfig\s*\{/,
        "defaultConfig {\n        ndk { abiFilters 'arm64-v8a' }"
      );
    }

    cfg.modResults.contents = s;
    return cfg;
  });
};
