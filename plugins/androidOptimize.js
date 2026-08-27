const {
  withAppBuildGradle,
  withGradleProperties,
} = require('@expo/config-plugins');

/**
 * تحسينات بناء أندرويد لنسخة الإصدار:
 * 1) فرض minify + shrinkResources (R8) لإخفاء/تشويش الكود الأصلي وتقليل الحجم.
 * 2) تقييد بنى ABI بـ arm64-v8a فقط (الأجهزة الحديثة — 95%+ من الأجهزة النشطة)
 *    لتقليل حجم الـ APK بأقصى حد ممكن.
 *
 * الطريقة المعتمدة: ضبط خاصية `reactNativeArchitectures` في gradle.properties،
 * وهي الخاصية التي يقرأها قالب RN داخل `ndk { abiFilters (*reactNativeArchitectures()) }`.
 * هذا أضمن من التلاعب بنص build.gradle (يتجنّب تكرار كتلة ndk أو الاعتماد على
 * وجود/عدم وجود نص "abiFilters"). يقتصر أبيات RN الأصلية وصولاً إلى كيمو (Chaquopy)
 * على arm64-v8a.
 *
 * محرك JS يبقى Hermes (الافتراضي في RN 0.81) الذي يُحوّل الكود إلى bytecode بدل
 * النص الصريح، ما يحميه من الهندسة العكسية.
 */
module.exports = function androidReleaseOptimize(config) {
  config = withAppBuildGradle(config, (cfg) => {
    let s = cfg.modResults.contents;

    // 1) فرض minify + shrinkResources في نسخة release
    if (s.includes('minifyEnabled')) {
      s = s.replace(/minifyEnabled\s+[^\n]+/, 'minifyEnabled true');
    }
    if (s.includes('shrinkResources')) {
      s = s.replace(/shrinkResources\s+[^\n]+/, 'shrinkResources true');
    }

    cfg.modResults.contents = s;
    return cfg;
  });

  config = withGradleProperties(config, (cfg) => {
    const props = cfg.modResults;
    const idx = props.findIndex((p) => p.name === 'reactNativeArchitectures');
    if (idx >= 0) {
      props[idx].value = 'arm64-v8a';
    } else {
      props.push({
        type: 'property',
        name: 'reactNativeArchitectures',
        value: 'arm64-v8a',
      });
    }
    return cfg;
  });

  return config;
};
