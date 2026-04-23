import type { Palette } from './palette.js';

export interface StoredAsset {
  id: string;
  name: string;
  dataUrl: string;
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

export interface SteamAppDetails {
  appId: string;
  name: string;
  shortDescription: string;
  genres: string[];
  categories: string[];
  headerImage: string;
  screenshots: Array<{ id: number; pathFull: string }>;
  background: string | null;
  capsuleImage: string | null;
}
