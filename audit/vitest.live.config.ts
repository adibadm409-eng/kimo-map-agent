import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      'react-native': path.resolve(__dirname, './react-native-test-shim.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 30_000,
  },
})
