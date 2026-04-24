import type { Palette } from './palette.js';

/**
 * A brand asset (logo, example thumbnail) stored in a GameProfile.
 *
 * Binaries are referenced by content hash (SHA-256) — never inlined as data
 * URLs — so the profile stays small enough for chrome.storage.local and the
 * future BinaryStore contract owns the actual byte storage.
 */
export interface StoredAsset {
  id: string;
  name: string;
  binaryRef: string;
  mimeType: string;
  bytes: number;
}

export interface StoreAssets {
  headerCapsule: string;
  heroImage: string | null;
  screenshots: string[];
  logo: string | null;
}

export interface GameBrand {
  logos: StoredAsset[];
  colors: string[];
  exampleThumbnails: StoredAsset[];
}

export interface GameProfile {
  appId: string;
  name: string;
  shortDescription: string;
  tags: string[];
  storeAssets: StoreAssets;
  palette: Palette;
  brand: GameBrand;
  createdAt: number;
  lastUsedAt: number;
}
