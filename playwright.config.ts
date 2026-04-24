import { defineConfig } from '@playwright/test';

/**
 * Chrome extension E2E.
 *
 * The extension is loaded into a persistent Chromium context (required for
 * MV3 extensions). Each test sets up its own `launchPersistentContext` in
 * a fixture because Playwright's default browser instances can't load
 * unpacked extensions.
 *
 * Prereq: the extension must be built first — `npm run build:ext` at the
 * root handles this. `verify:e2e` chains build → test.
 */
export default defineConfig({
  testDir: 'extensions/chrome/tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: '.verify/e2e.json' }],
  ],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
