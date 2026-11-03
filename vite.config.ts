/// <reference types="vitest" />

import legacy from '@vitejs/plugin-legacy'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    // Absolute URLs point at files in public/ and must stay plain URLs; Vitest cannot import them.
    vue({ template: { transformAssetUrls: { includeAbsolute: false } } }),
    legacy()
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // admin/ is a separate app with its own Vite config and dependencies.
  optimizeDeps: {
    entries: ['index.html']
  },
  test: {
    globals: true,
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, 'admin/**']
  }
})
