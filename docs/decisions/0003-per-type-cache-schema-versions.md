# 0003 — Per-type cache schema versions

**Status:** accepted — 2026-04-24

## Context

`packages/core/src/cache.ts` originally declared a single module-level integer:

```ts
export const CACHE_SCHEMA_VERSION = 1;
```

Every `CacheEntry<T>` stored this same version. A schema change to one entry type (e.g. adding a field to `VisualSignature`) required bumping the global — which invalidated every cached `StoreMetadata`, `Palette`, and `GameProfile` at the same time.

For MVP this is tolerable. For a user with a populated cache, bumping for a new signature field would force a re-fetch of the entire game library on upgrade. The cost of avoiding that is modest and the opportunity is now — before the field is in wide use.

## Decision

Per-entry-type schema versions, maintained in a single module-level registry.

```ts
export const CACHE_SCHEMA_VERSIONS = {
  storeMetadata: 1,
  palette: 1,
  gameProfile: 1,
  signature: 1,
  userPreferences: 1,
  selectionHistory: 1,
} as const;

export type CacheEntryType = keyof typeof CACHE_SCHEMA_VERSIONS;
```

Every `CacheEntry<T>` carries `{ type: CacheEntryType, schemaVersion: number, ... }`. Cache reads enforce `entry.schemaVersion === CACHE_SCHEMA_VERSIONS[entry.type]` — mismatches drop the stale entry and return a miss.

Typed `cacheKeys` constructors return `{ key, type }` tuples so callers never supply the `type` explicitly:

```ts
cacheKeys.storeMetadata(appId) // → { key: 'store:${appId}', type: 'storeMetadata' }
```

## Consequences

- Bumping one type's version invalidates only that type's cached entries. Other types keep their warm caches.
- Adding a new entry type is a three-step change: extend `CACHE_SCHEMA_VERSIONS`, add a `cacheKeys.*` constructor, use the constructor at call sites. No freeform strings ever cross the cache boundary.
- The registry is a single source of truth — reviewers can see the versioning status of every cached type at a glance.
- Old single-`CACHE_SCHEMA_VERSION` callers are gone. This is a breaking change inside core; no external consumers exist yet.
- No runtime migration is required for the transition itself — the old integer is simply dropped. Any pre-existing cached entries that don't carry a `type` field are invalid under the new `isValidEntry` check and dropped on first access.
