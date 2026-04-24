import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchStoreMetadata } from '../src/store-metadata.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

async function loadTextFixture(rel: string): Promise<string> {
  return readFile(join(FIXTURES, rel), 'utf8');
}

/**
 * Build a fetch implementation that serves known fixture URLs and throws on
 * anything else. Injected via options.fetch so tests don't have to touch
 * globalThis.
 */
function makeFetch(
  routes: Array<[pattern: RegExp, respond: () => Response]>,
): typeof globalThis.fetch {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    calls.push(url);
    for (const [pattern, respond] of routes) {
      if (pattern.test(url)) return respond();
    }
    throw new Error(`Unrouted fetch: ${url}`);
  }) as typeof globalThis.fetch;
  (fn as unknown as { calls: string[] }).calls = calls;
  return fn;
}

describe('fetchStoreMetadata', () => {
  it('returns StoreMetadata for a successful appdetails + store page pair', async () => {
    const apiJson = await loadTextFixture('api/1366800.json');
    const storeHtml = await loadTextFixture('pages/1366800.html');

    const fetchImpl = makeFetch([
      [
        /\/api\/appdetails/,
        () => new Response(apiJson, { status: 200, headers: { 'content-type': 'application/json' } }),
      ],
      [
        /\/app\/1366800/,
        () => new Response(storeHtml, { status: 200, headers: { 'content-type': 'text/html' } }),
      ],
    ]);

    const result = await fetchStoreMetadata('1366800', { fetch: fetchImpl });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const m = result.data;
    expect(m.appId).toBe('1366800');
    expect(m.name).toBe('Crosshair X');
    expect(m.assets.header).toMatch(/^https:\/\//);
    expect(m.assets.screenshots.length).toBeGreaterThan(0);
    expect(['api', 'mixed']).toContain(m.source);
  });

  it('reports rate-limited when Steam returns 429', async () => {
    const fetchImpl = makeFetch([
      [
        /\/api\/appdetails/,
        () =>
          new Response('', {
            status: 429,
            headers: { 'retry-after': '30' },
          }),
      ],
    ]);

    const result = await fetchStoreMetadata('1366800', { fetch: fetchImpl });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('rate-limited');
    expect(result.error.retryAfter).toBe(30);
  });

  it('reports network-error for non-429 HTTP failures', async () => {
    const fetchImpl = makeFetch([
      [/\/api\/appdetails/, () => new Response('', { status: 503 })],
    ]);

    const result = await fetchStoreMetadata('1366800', { fetch: fetchImpl });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('network-error');
    expect(result.error.statusCode).toBe(503);
  });

  it('reports parse-error when the API returns invalid JSON', async () => {
    const fetchImpl = makeFetch([
      [
        /\/api\/appdetails/,
        () =>
          new Response('not json', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ],
    ]);

    const result = await fetchStoreMetadata('1366800', { fetch: fetchImpl });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('parse-error');
  });

  it('reports not-found when the API response says success:false', async () => {
    const fetchImpl = makeFetch([
      [
        /\/api\/appdetails/,
        () =>
          new Response(JSON.stringify({ '1366800': { success: false } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ],
    ]);

    const result = await fetchStoreMetadata('1366800', { fetch: fetchImpl });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('not-found');
  });

  it('reports network-error when fetch throws', async () => {
    const fetchImpl = (async () => {
      throw new Error('socket hang up');
    }) as typeof globalThis.fetch;

    const result = await fetchStoreMetadata('1366800', { fetch: fetchImpl });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('network-error');
  });

  it('reports not-found for invalid app IDs without invoking fetch', async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response('');
    }) as typeof globalThis.fetch;

    const result = await fetchStoreMetadata('not-a-number', { fetch: fetchImpl });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('not-found');
    expect(called).toBe(false);
  });

  it('returns aborted when the caller aborts before the request starts', async () => {
    const ctl = new AbortController();
    ctl.abort();
    const result = await fetchStoreMetadata('1366800', { signal: ctl.signal });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('aborted');
  });

  it('honors a caller-supplied timeout greater than the default', async () => {
    // Prove the silent clamp is gone: ask for 10s, simulate a slow response
    // that resolves at ~50ms, and confirm we don't time out.
    const apiJson = await loadTextFixture('api/1366800.json');
    const storeHtml = await loadTextFixture('pages/1366800.html');

    const slowFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, 50);
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new Error('aborted'));
        });
      });
      if (/\/api\/appdetails/.test(url)) {
        return new Response(apiJson, { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (/\/app\/1366800/.test(url)) {
        return new Response(storeHtml, { status: 200, headers: { 'content-type': 'text/html' } });
      }
      throw new Error(`Unrouted: ${url}`);
    }) as typeof globalThis.fetch;

    const result = await fetchStoreMetadata('1366800', { fetch: slowFetch, timeout: 10_000 });
    expect(result.ok).toBe(true);
  });
});
