import type { CacheEntry, ContextCache, GameProfile } from '@announcekit/core';
import { cacheKeys } from '@announcekit/core';

/**
 * Normalize a cached GameProfile to the current schema. Older cache rows
 * predate the `referenceImages` bucket on `brand` — coalesce missing fields
 * here so callers can always read the full shape without optional chaining.
 *
 * This is a load-boundary migration: when we load, we fix; we don't rewrite
 * the cache eagerly. Next time the profile is saved (any user edit) the
 * normalized shape is persisted.
 */
function normalizeGameProfile(profile: GameProfile): GameProfile {
  const brand = profile.brand ?? { brandAssets: [], referenceImages: [], colors: [] };
  if (
    Array.isArray(brand.brandAssets) &&
    Array.isArray(brand.referenceImages) &&
    Array.isArray(brand.colors)
  ) {
    return profile;
  }
  return {
    ...profile,
    brand: {
      brandAssets: Array.isArray(brand.brandAssets) ? brand.brandAssets : [],
      referenceImages: Array.isArray(brand.referenceImages)
        ? brand.referenceImages
        : [],
      colors: Array.isArray(brand.colors) ? brand.colors : [],
    },
  };
}

export async function getGameProfile(
  cache: ContextCache,
  appId: string,
): Promise<CacheEntry<GameProfile> | null> {
  const entry = await cache.get<GameProfile>(cacheKeys.gameProfile(appId));
  if (!entry) return null;
  return { ...entry, data: normalizeGameProfile(entry.data) };
}

export async function saveGameProfile(
  cache: ContextCache,
  profile: GameProfile,
): Promise<void> {
  await cache.set(cacheKeys.gameProfile(profile.appId), profile, {
    source: 'fetchStoreMetadata',
  });
}

export async function invalidateGameProfile(
  cache: ContextCache,
  appId: string,
): Promise<void> {
  await cache.invalidate(cacheKeys.gameProfile(appId));
}

/**
 * Enumerate every cached game profile. Routes through ContextCache.list()
 * so the direct chrome.storage.local.get(null) leak from earlier is gone.
 */
export async function listGameProfiles(
  cache: ContextCache,
): Promise<CacheEntry<GameProfile>[]> {
  const entries = await cache.list<GameProfile>('profile:');
  return entries
    .map((e) => ({ ...e, data: normalizeGameProfile(e.data) }))
    .sort((a, b) => b.cachedAt - a.cachedAt);
}
