/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'service-worker.ts',
      injectRegister: false,
      manifest: false,
      injectManifest: {
        rollupFormat: 'iife',
        globPatterns: ['**/*.{js,css,html,json,png,ico,svg,woff2}'],
        // the retire worker is served only at /new/service-worker.js (Traefik psytoolsretire); the root worker must not precache it
        globIgnores: ['**/node_modules/**/*', 'retire-service-worker.js'],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    silent: false,
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
});
