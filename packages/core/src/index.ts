export type {
  GameProfile,
  GameBrand,
  StoreAssets,
  StoredAsset,
  SteamAppDetails,
} from './types.js';

export type {
  PageVariant,
  PageContextData,
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

export { parseSteamAppDetails } from './steam-api.js';
export { fetchStoreMetadata } from './store-metadata.js';
export {
  parseCommunityConfig,
  parsePartnerEventStore,
  extractEventGidFromUrl,
  extractAppIdFromUrl,
  detectPageVariant,
  findEventByGid,
} from './steam-page.js';
