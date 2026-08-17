const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

config.resolver = {
  ...config.resolver,
  // expo-sqlite للويب يحمل محرك wa-sqlite كأصل WASM؛ يجب أن يبقى ضمن assetExts.
  assetExts: Array.from(new Set([...(config.resolver.assetExts ?? []), 'wasm'])),
  // منع Metro من مراقبة ملفات Android/iOS الأصلية الضخمة والمسارات غير اللازمة.
  // نحتفظ بكل sourceExts وassetExts الافتراضية التي يضيفها Expo.
  blockList: [
    /node_modules\/react-native\/React(Android|Common|iOS)\/.*/,
    /node_modules\/@react-native\/.+\/(android|ios|third-party-podspecs)\/.*/,
    /node_modules\/expo\/.*\.(iml|gradle|pbxproj|c)$/,
    /\.git\//,
    /\/(android|ios)\//,
  ],
}

config.transformer = {
  ...config.transformer,
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: true,
    },
  }),
}

config.reporter = {
  update(event) {
    if (event.type === 'bundle_build_done') {
      console.log('[METRO] Bundle ready (' + event.totalModules + ' modules)')
    }
    if (event.type === 'bundle_build_started') {
      console.log('[METRO] Building bundle...')
    }
  },
}

module.exports = config
