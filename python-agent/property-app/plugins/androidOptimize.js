const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * تحسينات بناء أندرويد لنسخة الإصدار:
 * 1) فرض minify + shrinkResources (R8) لإخفاء/تشويش الكود الأصلي وتقليل الحجم.
 * 2) تقييد بنى ABI بـ arm64-v8a و armeabi-v7a (الأجهزة الحديثة ومعظم الأجهزة
 *    القديمة) وحذف بنيات x86/x86_64 الخاصة بالمحاكيات لتقليل حجم الـ APK بشكل كبير.
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

    // 2) تقييد بنى ABI (حذف x86/x86_64)
    if (!s.includes('abiFilters')) {
      s = s.replace(
        /defaultConfig\s*\{/,
        "defaultConfig {\n        ndk { abiFilters 'arm64-v8a', 'armeabi-v7a' }"
      );
    }

    cfg.modResults.contents = s;
    return cfg;
  });
};
