/**
 * Chrome-storage-local implementation of the core StorageAdapter interface.
 *
 * Never throws out of the adapter — chrome.storage failures surface as
 * rejected promises, which the cache layer converts to misses.
 */

import type { StorageAdapter } from '@announcekit/core';

export interface ChromeStorageAdapterOptions {
  /**
   * chrome.storage namespace to use. Defaults to chrome.storage.local. Exposed
   * so tests can substitute a fake without monkeypatching globals.
   */
  storage?: chrome.storage.StorageArea;
}

export function createChromeStorageAdapter(
  opts: ChromeStorageAdapterOptions = {},
): StorageAdapter {
  const area = opts.storage ?? chrome.storage.local;

  return {
    async get(key: string): Promise<unknown | undefined> {
      const result = await area.get(key);
      return result[key];
    },

    async set(key: string, value: unknown): Promise<void> {
      await area.set({ [key]: value });
    },

    async delete(keys: string | string[]): Promise<void> {
      await area.remove(keys);
    },

    async list(prefix: string): Promise<Array<[string, unknown]>> {
      const all = (await area.get(null)) as Record<string, unknown>;
      const out: Array<[string, unknown]> = [];
      for (const [k, v] of Object.entries(all)) {
        if (k.startsWith(prefix)) out.push([k, v]);
      }
      return out;
    },
  };
}
