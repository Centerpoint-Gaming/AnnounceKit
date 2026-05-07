/**
 * Contract: assembleGameProfile
 *
 * Pure merge of core-typed inputs into a GameProfile. The medium is
 * responsible for fetching/scraping/decoding to produce these inputs;
 * this function never touches I/O.
 *
 * Replaces the inline merge that used to live in App.tsx — same output,
 * lifted into core so any medium (chrome extension, future tauri/web app,
 * Node CLI) can call it.
 */

import type { GameBrand, GameProfile } from './types.js';
import type { Palette } from '../palette/index.js';
import type { StoreMetadata } from '../steam/store-metadata.js';

export interface AssembleGameProfileInput {
  appId: string;
  metadata: StoreMetadata;
  palette: Palette;
  /** Existing brand bucket to preserve across re-assembly. Defaults to empty. */
  brand?: GameBrand;
  /** Override timestamps (mostly for tests). Defaults to Date.now(). */
  now?: number;
}

const EMPTY_BRAND: GameBrand = { brandAssets: [], referenceImages: [], colors: [] };

export function assembleGameProfile(input: AssembleGameProfileInput): GameProfile {
  const { appId, metadata, palette, brand, now } = input;
  const t = now ?? Date.now();

  return {
    appId,
    name: metadata.name,
    shortDescription: metadata.shortDescription,
    tags: [...metadata.tags, ...metadata.genres, ...metadata.categories],
    storeAssets: {
      headerCapsule: metadata.assets.header,
      heroImage: metadata.assets.background,
      screenshots: metadata.assets.screenshots,
      logo: metadata.assets.capsule || null,
    },
    palette,
    brand: brand ?? EMPTY_BRAND,
    createdAt: t,
    lastUsedAt: t,
  };
}
