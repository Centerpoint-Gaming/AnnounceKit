import { defineConfig } from 'vite';
import { resolve } from 'path';

/** Builds service-worker.js as a self-contained IIFE (no ES module imports). */
export default defineConfig({
  // Load .env from the repo root so VITE_GEMINI_API_KEY is baked in here too.
  envDir: resolve(__dirname, '../..'),
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/background/service-worker.ts'),
      name: 'AnnounceKitSW',
      formats: ['iife'],
      fileName: () => 'service-worker.js',
    },
    rollupOptions: {},
  },
  resolve: {
    alias: {
      '@announcekit/core': resolve(__dirname, '../../packages/core/src'),
    },
  },
});
