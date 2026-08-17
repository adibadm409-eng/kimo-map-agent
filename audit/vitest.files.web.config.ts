import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  define: { __DEV__: false },
  resolve: {
    alias: {
      'react-native': path.resolve(__dirname, './react-native-web-test-shim.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 10_000,
  },
})
