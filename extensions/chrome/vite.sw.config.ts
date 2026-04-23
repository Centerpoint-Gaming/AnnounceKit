import { defineConfig } from 'vite';
import { resolve } from 'path';

/** Builds service-worker.js as a self-contained IIFE (no ES module imports). */
export default defineConfig({
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
