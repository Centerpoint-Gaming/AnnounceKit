/**
 * Chrome-extension ContextCache factory.
 *
 * Constructs the core's AdapterContextCache over a chrome.storage.local
 * adapter, with an in-memory fallback for environments where storage is
 * unavailable (private browsing probe failure).
 *
 * No singletons — callers that need the cache construct it once near their
 * entry point (service worker, popup) and pass it down. Tests build one per
 * case over a fake chrome.storage.StorageArea.
 */

import type { ContextCache } from '@announcekit/core';
import { createContextCache, createMemoryCache } from '@announcekit/core';
import { createChromeStorageAdapter } from '../adapters/chrome-storage-adapter';

export interface BuildContextCacheOptions {
  storage?: chrome.storage.StorageArea;
}

export function buildContextCache(opts: BuildContextCacheOptions = {}): ContextCache {
  try {
    const adapter = createChromeStorageAdapter({ storage: opts.storage });
    return createContextCache({ storage: adapter });
  } catch {
    // chrome.storage missing entirely — fall back to an in-memory cache so
    // the popup/service worker still render, just without persistence.
    return createMemoryCache();
  }
}
