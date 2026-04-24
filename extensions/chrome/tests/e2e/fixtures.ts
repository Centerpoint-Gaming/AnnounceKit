/**
 * Playwright fixture: loads the built extension into a persistent Chromium
 * context and exposes its extension ID. Re-uses the core test fixtures
 * (API JSON, capsule images, store page HTML) captured by
 * `scripts/refresh-fixtures.ts` so E2E runs are network-free and
 * deterministic.
 */

import { test as base, chromium, type BrowserContext, type Worker } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const EXTENSION_DIST = join(REPO_ROOT, 'extensions', 'chrome', 'dist');
const CORE_FIXTURES = join(REPO_ROOT, 'packages', 'core', 'tests', 'fixtures');

export interface ExtensionFixtures {
  context: BrowserContext;
  extensionId: string;
  serviceWorker: Worker;
}

export const test = base.extend<ExtensionFixtures>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${EXTENSION_DIST}`,
        `--load-extension=${EXTENSION_DIST}`,
      ],
    });
    await use(context);
    await context.close();
  },

  serviceWorker: async ({ context }, use) => {
    // MV3 service workers can be dormant at launch — wait for the first
    // registration event if one hasn't fired yet.
    let [sw] = context.serviceWorkers();
    if (!sw) {
      sw = await context.waitForEvent('serviceworker');
    }
    await use(sw);
  },

  extensionId: async ({ serviceWorker }, use) => {
    // chrome-extension://<id>/service-worker.js
    const id = new URL(serviceWorker.url()).host;
    await use(id);
  },
});

export { expect } from '@playwright/test';

/**
 * Install deterministic Steam routes on the given context. All Steam-owned
 * URLs resolve to committed fixtures; anything else passes through
 * (but tests should avoid relying on that).
 */
export async function mockSteam(context: BrowserContext, appId: string): Promise<void> {
  const apiJson = await readFile(join(CORE_FIXTURES, 'api', `${appId}.json`), 'utf8');
  const storeHtml = await readFile(join(CORE_FIXTURES, 'pages', `${appId}.html`), 'utf8');
  const capsuleBytes = await readFile(join(CORE_FIXTURES, 'images', `${appId}-capsule.jpg`));
  const headerBytes = await readFile(join(CORE_FIXTURES, 'images', `${appId}-header.jpg`));

  await context.route('**/api/appdetails*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: apiJson,
    }),
  );

  await context.route(`**/app/${appId}*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: storeHtml,
    }),
  );

  await context.route('**/*capsule*.jpg*', (route) =>
    route.fulfill({ status: 200, contentType: 'image/jpeg', body: capsuleBytes }),
  );
  await context.route('**/*header*.jpg*', (route) =>
    route.fulfill({ status: 200, contentType: 'image/jpeg', body: headerBytes }),
  );
}
