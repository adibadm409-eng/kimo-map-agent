const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.server = {
  port: 8081,
  hostname: '0.0.0.0',
  runInspector: false,
};

config.watchFolders = [__dirname];

config.resolver = {
  ...config.resolver,
  unstable_enableSymlinks: true,
  sourceExts: ['js', 'jsx', 'json', 'ts', 'tsx', 'cjs', 'mjs'],
  assetExts: [...getDefaultConfig(__dirname).resolver.assetExts, 'wasm'],
  // استبعاد المسارات الضخمة غير الضرورية من فحص/مراقبة المترو، للتخفيف من
  // استهلاك حد inotify (عدد المراقبين) على الأجهزة التي لا تستطيع رفعه —
  // يمنع انهيار ENOSPC عند فحص شيفرة جافا/كوتلن للتطبيقات الأصلية.
  blockList: [
    /node_modules\/react-native\/React(Android|Common|iOS)\/.*/,
    /node_modules\/@react-native\/.+\/(android|ios|third-party-podspecs)\/.*/,
    /node_modules\/expo\/.*\.(iml|gradle|pbxproj|c)$/,
    /\.git\//,
    /\/(android|ios)\//,
  ],
};

config.transformer = {
  ...config.transformer,
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: true,
    },
  }),
};

config.reporter = {
  update(event) {
    if (event.type === 'bundle_build_done') {
      console.log('[METRO] Bundle ready (' + event.totalModules + ' modules) - watching for changes...')
    }
    if (event.type === 'bundle_build_started') {
      console.log('[METRO] Rebuilding bundle...')
    }
  },
};

module.exports = config;