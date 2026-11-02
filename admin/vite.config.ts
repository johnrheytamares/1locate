/// <reference types="vitest" />
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue({ template: { transformAssetUrls: { includeAbsolute: false } } })],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.spec.ts'],
  },
});
