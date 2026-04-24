import type { CacheEntry, ContextCache, GameProfile } from '@announcekit/core';
import { cacheKeys } from '@announcekit/core';

export async function getGameProfile(
  cache: ContextCache,
  appId: string,
): Promise<CacheEntry<GameProfile> | null> {
  return cache.get<GameProfile>(cacheKeys.gameProfile(appId));
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
  return entries.sort((a, b) => b.cachedAt - a.cachedAt);
}
