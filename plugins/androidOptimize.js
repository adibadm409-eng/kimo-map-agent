const { withAppBuildGradle, withGradleProperties } = require('@expo/config-plugins');

/**
 * تحسينات بناء أندرويد لنسخة الإصدار:
 * 1) فرض minify + shrinkResources (R8) لإخفاء/تشويش الكود الأصلي وتقليل الحجم.
 * 2) تقييد بنى ABI بـ arm64-v8a فقط (أجهزة حديثة).
 *    نستخدم reactNativeArchitectures لمنع بناء CMake للمعماريات غير المطلوبة.
 */
module.exports = function androidReleaseOptimize(config) {
  // 1) reactNativeArchitectures=arm64-v8a في gradle.properties
  config = withGradleProperties(config, (cfg) => {
    const existing = cfg.modResults.find((p) => p.key === 'reactNativeArchitectures')
    if (existing) {
      existing.value = 'arm64-v8a'
    } else {
      cfg.modResults.push({ key: 'reactNativeArchitectures', value: 'arm64-v8a' })
    }
    return cfg
  })

  // 2) abiFilters في build.gradle لضمان الحزم النهائي
  config = withAppBuildGradle(config, (cfg) => {
    let s = cfg.modResults.contents;

    if (s.includes('minifyEnabled')) {
      s = s.replace(/minifyEnabled\s+[^\n]+/, 'minifyEnabled true');
    }
    if (s.includes('shrinkResources')) {
      s = s.replace(/shrinkResources\s+[^\n]+/, 'shrinkResources true');
    }

    if (!s.includes('abiFilters')) {
      s = s.replace(
        /defaultConfig\s*\{/,
        "defaultConfig {\n        ndk { abiFilters 'arm64-v8a' }"
      );
    }

    cfg.modResults.contents = s;
    return cfg;
  });

  return config;
};
