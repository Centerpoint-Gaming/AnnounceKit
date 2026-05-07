import type { Palette } from '../palette/index.js';

/**
 * Generation-relevant role of a brand asset. Read by the prompt builder so
 * a logo gets composited verbatim, a character drives the focal subject, etc.
 * Optional — uncategorized assets are treated as 'other'.
 */
export type AssetRole =
  | 'logo'
  | 'character'
  | 'environment'
  | 'mood'
  | 'other';

/**
 * A brand asset stored in a GameProfile. Binaries live in the BinaryStore
 * (content-addressed by SHA-256); this struct is metadata only.
 *
 * `source` distinguishes user uploads from Steam-derived assets the user
 * promoted into the bucket. Both shapes are otherwise identical, so the
 * prompt builder treats them uniformly.
 */
export interface StoredAsset {
  id: string;
  name: string;
  binaryRef: string;
  mimeType: string;
  bytes: number;
  source: 'upload' | 'steam';
  sourceUrl?: string;
  role?: AssetRole;
  /**
   * Free-form note the user writes about this asset — sent to the model as
   * per-image guidance ("our mascot Shibu in summer attire", "must appear
   * brandishing a sword"). Optional.
   */
  description?: string;
  addedAt: number;
}

export interface StoreAssets {
  headerCapsule: string;
  heroImage: string | null;
  screenshots: string[];
  logo: string | null;
}

/**
 * Compositional intent for a curated brand color. Drives prompt phrasing —
 * `primary` sets the dominant tone, `accent` adds pops, `background` defines
 * atmosphere, `brand` colors must be reproduced exactly (logos, mascots),
 * `custom` carries a free-form `label` so the user can name their own slot
 * (e.g. "rim light", "team blue").
 */
export type BrandColorRole =
  | 'primary'
  | 'accent'
  | 'background'
  | 'brand'
  | 'custom';

export const BRAND_COLOR_ROLES: readonly BrandColorRole[] = [
  'primary',
  'accent',
  'background',
  'brand',
  'custom',
] as const;

export interface BrandColor {
  hex: string;
  role: BrandColorRole;
  /** Required when role is 'custom'; ignored otherwise. */
  label?: string;
}

export interface GameBrand {
  /**
   * Identity ingredients — logo, character, environment, mood images. The
   * prompt treats these as inspiration the model should incorporate, not
   * literal targets.
   */
  brandAssets: StoredAsset[];
  /**
   * Approved layout/format templates — typically previously-accepted
   * thumbnails. The prompt instructs the model to match composition,
   * framing, and visual hierarchy of these references; identity comes from
   * `brandAssets` instead.
   */
  referenceImages: StoredAsset[];
  colors: BrandColor[];
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
