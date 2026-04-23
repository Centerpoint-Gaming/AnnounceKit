import { defineConfig } from 'vite';
import { resolve } from 'path';

/** Builds content.js as a self-contained IIFE (no ES module imports). */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/content/scraper.ts'),
      name: 'AnnounceKitContent',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
    rollupOptions: {},
  },
  resolve: {
    alias: {
      '@announcekit/core': resolve(__dirname, '../../packages/core/src'),
    },
  },
});
