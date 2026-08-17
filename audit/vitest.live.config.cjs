/* global __dirname */

const path = require('node:path')

module.exports = {
  define: { __DEV__: false },
  resolve: {
    alias: {
      'react-native': path.resolve(__dirname, './react-native-test-shim.ts'),
      'expo': path.resolve(__dirname, './expo-native-test-shim.ts'),
      'expo-file-system/legacy': path.resolve(__dirname, './expo-file-system-test-shim.ts'),
      'expo-sqlite': path.resolve(__dirname, './expo-native-test-shim.ts'),
      'expo-secure-store': path.resolve(__dirname, './expo-native-test-shim.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 180000,
    hookTimeout: 30000,
  },
}
