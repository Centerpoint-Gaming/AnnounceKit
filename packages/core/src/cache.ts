/**
 * Contract: contextCache
 *
 * The storage layer that makes context capture fast on subsequent opens.
 * Defines the cache interface, entry shape, typed key factories, and
 * per-entry-type schema versions.
 *
 * The interface is platform-agnostic. Implementations talk to a StorageAdapter
 * (chrome.storage.local for the extension, an in-memory Map for tests, etc.)
 * constructed via createContextCache({ storage }). No singletons in core.
 *
 * Invariants:
 *   - Per-type schema-version mismatch → cache miss, drop the stale entry
 *   - Never expose storage errors to UI — always degrade to cache miss
 *   - Concurrent writes to same key → last-writer-wins, no corruption
 *   - Reads <50ms, writes <100ms on typical hardware
 */

// ─── Schema versions (per entry type) ────────────────────────────────────────
//
// Bumping one type's version invalidates only that type, not the whole cache.
// Add new entry types here; never inline literal version numbers anywhere else.

export const CACHE_SCHEMA_VERSIONS = {
  storeMetadata: 1,
  palette: 1,
  gameProfile: 1,
  signature: 1,
  userPreferences: 1,
  selectionHistory: 1,
} as const;

export type CacheEntryType = keyof typeof CACHE_SCHEMA_VERSIONS;

/** Maximum total cache size in bytes before prune() starts evicting. */
export const CACHE_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

export interface CacheEntry<T> {
  type: CacheEntryType;
  data: T;
  schemaVersion: number;
  cachedAt: number;
  expiresAt: number | null;
  source: string;
}

export interface CacheSize {
  entries: number;
  bytes: number;
}

export interface PruneResult {
  removed: number;
}

export interface CacheSetOptions {
  /** Time-to-live in milliseconds. Omit or null for no expiry. */
  ttl?: number | null;
  /** Source identifier for debugging (e.g. "fetchStoreMetadata"). */
  source?: string;
}

/**
 * Typed cache key. `key` is the storage identifier; `type` selects the
 * schema-version registry and lets `get`/`set` enforce shape invariants
 * without forcing callers to repeat themselves.
 */
export interface CacheKey {
  key: string;
  type: CacheEntryType;
}

export interface ContextCache {
  get<T>(key: CacheKey): Promise<CacheEntry<T> | null>;
  set<T>(key: CacheKey, data: T, options?: CacheSetOptions): Promise<void>;
  invalidate(key: CacheKey): Promise<void>;
  invalidatePattern(pattern: string): Promise<void>;
  /**
   * List every non-expired, schema-valid entry whose key starts with `prefix`.
   * Used by consumers that need to enumerate (e.g. listGameProfiles). Returns
   * entries in insertion-agnostic order; callers sort as needed.
   */
  list<T>(prefix: string): Promise<CacheEntry<T>[]>;
  size(): Promise<CacheSize>;
  prune(): Promise<PruneResult>;
}

// ─── Typed cache keys ────────────────────────────────────────────────────────
//
// Always use these constructors — they know the CacheEntryType and the key
// format, so consumers never have to pass the type explicitly.

export const cacheKeys = {
  storeMetadata: (appId: string): CacheKey => ({
    key: `store:${appId}`,
    type: 'storeMetadata',
  }),
  palette: (appId: string): CacheKey => ({
    key: `palette:${appId}`,
    type: 'palette',
  }),
  signature: (appId: string): CacheKey => ({
    key: `signature:${appId}`,
    type: 'signature',
  }),
  userPreferences: (appId: string): CacheKey => ({
    key: `prefs:${appId}`,
    type: 'userPreferences',
  }),
  selectionHistory: (appId: string): CacheKey => ({
    key: `history:${appId}`,
    type: 'selectionHistory',
  }),
  gameProfile: (appId: string): CacheKey => ({
    key: `profile:${appId}`,
    type: 'gameProfile',
  }),
} as const;

// ─── StorageAdapter: platform-agnostic KV interface ──────────────────────────
//
// Mediums implement this once over whatever persistent storage they have
// (chrome.storage.local, localStorage, node-canvas test harness, etc.).
// createContextCache consumes an adapter rather than reaching for a global.

export interface StorageAdapter {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(keys: string | string[]): Promise<void>;
  /** Return every [key, value] pair whose key starts with `prefix`. */
  list(prefix: string): Promise<Array<[string, unknown]>>;
}

export interface CreateContextCacheOptions {
  storage: StorageAdapter;
  /** Storage-key prefix. Defaults to "cache:" so cache rows don't collide with app state. */
  namespace?: string;
  /** Cap before prune() evicts oldest. Defaults to CACHE_MAX_BYTES. */
  maxBytes?: number;
}

export interface CreateMemoryCacheOptions {
  maxBytes?: number;
}

// ─── Internals ───────────────────────────────────────────────────────────────

function expectedVersion(type: CacheEntryType): number {
  return CACHE_SCHEMA_VERSIONS[type];
}

function isValidEntry(raw: unknown): raw is CacheEntry<unknown> {
  if (!raw || typeof raw !== 'object') return false;
  const e = raw as Record<string, unknown>;
  if (typeof e.type !== 'string' || !(e.type in CACHE_SCHEMA_VERSIONS)) return false;
  if (typeof e.schemaVersion !== 'number') return false;
  if (typeof e.cachedAt !== 'number') return false;
  if (typeof e.source !== 'string') return false;
  return true;
}

function estimateBytes(value: unknown): number {
  try {
    return JSON.stringify(value).length * 2;
  } catch {
    return 0;
  }
}

// ─── In-memory storage adapter ───────────────────────────────────────────────

class MapStorageAdapter implements StorageAdapter {
  private store = new Map<string, unknown>();

  async get(key: string): Promise<unknown | undefined> {
    if (!this.store.has(key)) return undefined;
    return this.store.get(key);
  }

  async set(key: string, value: unknown): Promise<void> {
    this.store.set(key, value);
  }

  async delete(keys: string | string[]): Promise<void> {
    if (typeof keys === 'string') {
      this.store.delete(keys);
      return;
    }
    for (const k of keys) this.store.delete(k);
  }

  async list(prefix: string): Promise<Array<[string, unknown]>> {
    const out: Array<[string, unknown]> = [];
    for (const [k, v] of this.store.entries()) {
      if (k.startsWith(prefix)) out.push([k, v]);
    }
    return out;
  }
}

// ─── Generic ContextCache implementation over any StorageAdapter ─────────────

class AdapterContextCache implements ContextCache {
  private readonly storage: StorageAdapter;
  private readonly namespace: string;
  private readonly maxBytes: number;

  constructor(opts: CreateContextCacheOptions) {
    this.storage = opts.storage;
    this.namespace = opts.namespace ?? 'cache:';
    this.maxBytes = opts.maxBytes ?? CACHE_MAX_BYTES;
  }

  private ns(key: string): string {
    return `${this.namespace}${key}`;
  }

  private unNs(storageKey: string): string {
    return storageKey.slice(this.namespace.length);
  }

  async get<T>(key: CacheKey): Promise<CacheEntry<T> | null> {
    try {
      const raw = await this.storage.get(this.ns(key.key));
      if (raw == null) return null;

      if (!isValidEntry(raw)) {
        await this.storage.delete(this.ns(key.key));
        return null;
      }

      const entry = raw as CacheEntry<T>;

      if (entry.type !== key.type) {
        // Type collision at the storage layer (e.g. old format). Drop it.
        await this.storage.delete(this.ns(key.key));
        return null;
      }

      if (entry.schemaVersion !== expectedVersion(entry.type)) {
        await this.storage.delete(this.ns(key.key));
        return null;
      }

      if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
        await this.storage.delete(this.ns(key.key));
        return null;
      }

      return entry;
    } catch {
      return null;
    }
  }

  async set<T>(key: CacheKey, data: T, options?: CacheSetOptions): Promise<void> {
    const entry: CacheEntry<T> = {
      type: key.type,
      data,
      schemaVersion: expectedVersion(key.type),
      cachedAt: Date.now(),
      expiresAt: options?.ttl ? Date.now() + options.ttl : null,
      source: options?.source ?? 'unknown',
    };

    try {
      await this.storage.set(this.ns(key.key), entry);
    } catch {
      // Storage failure — swallow, next write will retry.
    }
  }

  async invalidate(key: CacheKey): Promise<void> {
    try {
      await this.storage.delete(this.ns(key.key));
    } catch {
      // ignore
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const matches = await this.storage.list(this.ns(pattern));
      if (matches.length === 0) return;
      await this.storage.delete(matches.map(([k]) => k));
    } catch {
      // ignore
    }
  }

  async list<T>(prefix: string): Promise<CacheEntry<T>[]> {
    try {
      const rows = await this.storage.list(this.ns(prefix));
      const now = Date.now();
      const out: CacheEntry<T>[] = [];

      for (const [, value] of rows) {
        if (!isValidEntry(value)) continue;
        const entry = value as CacheEntry<T>;
        if (entry.schemaVersion !== expectedVersion(entry.type)) continue;
        if (entry.expiresAt !== null && entry.expiresAt < now) continue;
        out.push(entry);
      }

      return out;
    } catch {
      return [];
    }
  }

  async size(): Promise<CacheSize> {
    try {
      const rows = await this.storage.list(this.namespace);
      let bytes = 0;
      for (const [, value] of rows) bytes += estimateBytes(value);
      return { entries: rows.length, bytes };
    } catch {
      return { entries: 0, bytes: 0 };
    }
  }

  async prune(): Promise<PruneResult> {
    try {
      const rows = await this.storage.list(this.namespace);
      const now = Date.now();
      const remove: string[] = [];
      const survivors: Array<{ storageKey: string; cachedAt: number; size: number }> = [];
      let totalBytes = 0;

      for (const [storageKey, value] of rows) {
        if (!isValidEntry(value)) {
          remove.push(storageKey);
          continue;
        }
        const entry = value as CacheEntry<unknown>;

        if (entry.expiresAt !== null && entry.expiresAt < now) {
          remove.push(storageKey);
          continue;
        }

        if (entry.schemaVersion !== expectedVersion(entry.type)) {
          remove.push(storageKey);
          continue;
        }

        const size = estimateBytes(value);
        totalBytes += size;
        survivors.push({ storageKey, cachedAt: entry.cachedAt, size });
      }

      // Size-cap eviction: precompute size, sort once, walk.
      if (totalBytes > this.maxBytes) {
        survivors.sort((a, b) => a.cachedAt - b.cachedAt);
        for (const s of survivors) {
          if (totalBytes <= this.maxBytes) break;
          remove.push(s.storageKey);
          totalBytes -= s.size;
        }
      }

      if (remove.length > 0) {
        await this.storage.delete(remove);
      }

      // Inline unNs keeps the lint happy — it's fine that we don't use it.
      void this.unNs;

      return { removed: remove.length };
    } catch {
      return { removed: 0 };
    }
  }
}

// ─── Factories ───────────────────────────────────────────────────────────────

export function createContextCache(opts: CreateContextCacheOptions): ContextCache {
  return new AdapterContextCache(opts);
}

export function createMemoryCache(opts: CreateMemoryCacheOptions = {}): ContextCache {
  return new AdapterContextCache({
    storage: new MapStorageAdapter(),
    maxBytes: opts.maxBytes,
  });
}

/**
 * Legacy class alias — delegates to createMemoryCache. Kept so existing
 * imports keep working through the migration; prefer createMemoryCache in
 * new code.
 */
export class MemoryCache implements ContextCache {
  private readonly inner: ContextCache;

  constructor(opts: CreateMemoryCacheOptions = {}) {
    this.inner = createMemoryCache(opts);
  }

  get<T>(key: CacheKey): Promise<CacheEntry<T> | null> {
    return this.inner.get<T>(key);
  }
  set<T>(key: CacheKey, data: T, options?: CacheSetOptions): Promise<void> {
    return this.inner.set(key, data, options);
  }
  invalidate(key: CacheKey): Promise<void> {
    return this.inner.invalidate(key);
  }
  invalidatePattern(pattern: string): Promise<void> {
    return this.inner.invalidatePattern(pattern);
  }
  list<T>(prefix: string): Promise<CacheEntry<T>[]> {
    return this.inner.list<T>(prefix);
  }
  size(): Promise<CacheSize> {
    return this.inner.size();
  }
  prune(): Promise<PruneResult> {
    return this.inner.prune();
  }
}
