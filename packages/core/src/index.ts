export type {
  GameProfile,
  GameBrand,
  StoreAssets,
  StoredAsset,
} from './types.js';

export type {
  PageVariant,
  PageContext,
  SteamCommunityConfig,
  SteamEventData,
  SteamEventJsonData,
} from './steam-page.js';

export type { Result } from './result.js';
export { ok, err } from './result.js';

export type {
  StoreMetadata,
  StoreMetadataAssets,
  StoreFetchError,
  StoreFetchErrorReason,
  ReleaseStatus,
  FetchStoreMetadataOptions,
} from './store-metadata.js';

export type { Palette, PaletteError, PaletteErrorReason } from './palette.js';
export { extractPaletteFromImageData } from './palette.js';

export type {
  CacheEntry,
  CacheEntryType,
  CacheKey,
  CacheSize,
  PruneResult,
  ContextCache,
  CacheSetOptions,
  StorageAdapter,
  CreateContextCacheOptions,
  CreateMemoryCacheOptions,
} from './cache.js';
export {
  cacheKeys,
  CACHE_SCHEMA_VERSIONS,
  CACHE_MAX_BYTES,
  MemoryCache,
  createMemoryCache,
  createContextCache,
} from './cache.js';

export { fetchStoreMetadata } from './store-metadata.js';
export {
  parseCommunityConfig,
  parsePartnerEventStore,
  extractEventGidFromUrl,
  extractAppIdFromUrl,
  detectPageVariant,
  findEventByGid,
} from './steam-page.js';
