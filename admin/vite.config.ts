
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const require = createRequire(import.meta.url);

// Resolve Capacitor from admin/node_modules even when imported
// by source files inside the shared/ directory.
const capacitorCorePath = require.resolve('@capacitor/core');

const viteConfig = defineConfig({
  plugins: [
    {
      name: 'mobile-walking-network',

      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const path = req.url?.split('?')[0];

          if (
            path !== '/campus-walking-network.json' &&
            path !== '/images/updated_map.png'
          ) {
            return next();
          }

          try {
            res.setHeader(
              'Content-Type',
              path.endsWith('.png')
                ? 'image/png'
                : 'application/json'
            );

            res.end(
              readFileSync(
                new URL(`../public${path}`, import.meta.url)
              )
            );
          } catch {
            res.statusCode = 404;
            res.end('Network not found');
          }
        });
      },

      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'images/updated_map.png',
          source: readFileSync(
            new URL(
              '../public/images/updated_map.png',
              import.meta.url
            )
          ),
        });

        this.emitFile({
          type: 'asset',
          fileName: 'campus-walking-network.json',
          source: readFileSync(
            new URL(
              '../public/campus-walking-network.json',
              import.meta.url
            ),
            'utf8'
          ),
        });
      },
    },

    vue({
      template: {
        transformAssetUrls: {
          includeAbsolute: false,
        },
      },
    }),
  ],

  resolve: {
    alias: {
      '@': fileURLToPath(
        new URL('./src', import.meta.url)
      ),

      '@capacitor/core': capacitorCorePath,
    },

    dedupe: ['vue'],
  },

  server: {
    port: 5174,
    strictPort: true,
  },
});

// Keep Vitest settings separate from Vite's plugin type checking.
// Vitest still reads the "test" property at runtime.

type AdminTestConfig = {
  globals: boolean;
  environment: string;
  include: string[];
};

type AdminConfig = import('vite').UserConfig & {
  test: AdminTestConfig;
};

const config: AdminConfig = {
  ...viteConfig,
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.spec.ts'],
  },
};

export default config;

