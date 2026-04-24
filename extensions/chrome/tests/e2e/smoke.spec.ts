/**
 * Extension smoke tests — these are the fast-feedback replacement for the
 * "reload in chrome://extensions and click around" manual loop.
 *
 * What each test proves:
 *   1. harness     — dist/ is a loadable MV3 extension, SW registers,
 *                    popup.html is addressable.
 *   2. steam flow — content script injects on a Steam-matching URL and
 *                   messages the SW, which updates the action badge.
 *                   This exercises the brittle DOM → message → SW path
 *                   end-to-end without touching live Steam.
 */

import { test, expect, mockSteam } from './fixtures.js';

test('extension loads and popup is addressable', async ({ context, extensionId }) => {
  expect(extensionId).toMatch(/^[a-z]{32}$/);

  const page = await context.newPage();
  const response = await page.goto(`chrome-extension://${extensionId}/popup.html`);
  expect(response?.status()).toBe(200);

  // React mounts — the AnnounceKit title is in the header on every state.
  await expect(page.getByRole('heading', { name: 'AnnounceKit' })).toBeVisible();
});

test('content script on a mocked Steam app page updates the action badge', async ({
  context,
  serviceWorker,
}) => {
  await mockSteam(context, '1366800');

  const page = await context.newPage();
  await page.goto('https://store.steampowered.com/app/1366800');

  // Service worker's PAGE_CONTEXT_READY handler calls chrome.action.setBadgeText.
  // Poll from within the SW so we see the same state the browser chrome does.
  await expect
    .poll(
      async () =>
        serviceWorker.evaluate(async () => {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.id) return '';
          return chrome.action.getBadgeText({ tabId: tab.id });
        }),
      { timeout: 10_000, message: 'waiting for badge text to be set' },
    )
    .toBe('OK');
});
