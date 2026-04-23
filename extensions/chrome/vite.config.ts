import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const coreAlias = {
  '@announcekit/core': resolve(__dirname, '../../packages/core/src'),
};

/*
 * Chrome extension build strategy:
 *
 * Content scripts and service workers in Manifest V3 cannot use ES module
 * imports — they must be self-contained scripts. We use Vite's multi-
 * environment build to produce three separate outputs:
 *
 *   1. popup    → normal ES module (loaded via popup.html <script type="module">)
 *   2. content  → IIFE, all deps inlined, no imports
 *   3. service-worker → IIFE, all deps inlined, no imports
 */
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
      },
      output: {
        entryFileNames: '[name].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  resolve: {
    alias: coreAlias,
  },
});
