import { describe, it, expect } from 'vitest';
import { assembleGameProfile } from '../../src/profile/assemble.js';
import type { StoreMetadata } from '../../src/steam/store-metadata.js';
import type { Palette } from '../../src/palette/index.js';
import type { GameBrand } from '../../src/profile/types.js';

const META: StoreMetadata = {
  appId: '1366800',
  name: 'Crosshair X',
  shortDescription: 'Customize and overlay a crosshair in any game.',
  tags: ['Utility'],
  genres: ['Tools'],
  categories: ['Single-player'],
  releaseDate: '2020-01-01',
  releaseStatus: 'released',
  developer: 'Studio',
  publisher: 'Publisher',
  assets: {
    capsule: 'https://example.com/capsule.jpg',
    header: 'https://example.com/header.jpg',
    library: 'https://example.com/library.jpg',
    screenshots: ['https://example.com/s1.jpg', 'https://example.com/s2.jpg'],
    background: 'https://example.com/bg.jpg',
  },
  fetchedAt: 0,
  source: 'api',
};

const PAL: Palette = {
  primary: '#1a1a1a',
  secondary: '#2a2a2a',
  accent: '#ff0044',
  neutral: '#cccccc',
  full: ['#1a1a1a', '#2a2a2a', '#ff0044', '#cccccc'],
  vibrancy: 'vibrant',
  luminance: 'dark',
};

describe('assembleGameProfile', () => {
  it('merges metadata + palette into a GameProfile', () => {
    const profile = assembleGameProfile({
      appId: '1366800',
      metadata: META,
      palette: PAL,
      now: 1000,
    });

    expect(profile.appId).toBe('1366800');
    expect(profile.name).toBe('Crosshair X');
    expect(profile.shortDescription).toBe('Customize and overlay a crosshair in any game.');
    expect(profile.palette).toBe(PAL);
    expect(profile.createdAt).toBe(1000);
    expect(profile.lastUsedAt).toBe(1000);
  });

  it('flattens tags + genres + categories into a single tag list', () => {
    const profile = assembleGameProfile({ appId: '1', metadata: META, palette: PAL });
    expect(profile.tags).toEqual(['Utility', 'Tools', 'Single-player']);
  });

  it('maps store assets through to GameProfile.storeAssets', () => {
    const profile = assembleGameProfile({ appId: '1', metadata: META, palette: PAL });
    expect(profile.storeAssets.headerCapsule).toBe('https://example.com/header.jpg');
    expect(profile.storeAssets.heroImage).toBe('https://example.com/bg.jpg');
    expect(profile.storeAssets.screenshots).toEqual([
      'https://example.com/s1.jpg',
      'https://example.com/s2.jpg',
    ]);
    expect(profile.storeAssets.logo).toBe('https://example.com/capsule.jpg');
  });

  it('coalesces empty capsule URL to null logo', () => {
    const meta = { ...META, assets: { ...META.assets, capsule: '' } };
    const profile = assembleGameProfile({ appId: '1', metadata: meta, palette: PAL });
    expect(profile.storeAssets.logo).toBeNull();
  });

  it('preserves null background as null heroImage', () => {
    const meta = { ...META, assets: { ...META.assets, background: null } };
    const profile = assembleGameProfile({ appId: '1', metadata: meta, palette: PAL });
    expect(profile.storeAssets.heroImage).toBeNull();
  });

  it('defaults brand to an empty bucket', () => {
    const profile = assembleGameProfile({ appId: '1', metadata: META, palette: PAL });
    expect(profile.brand).toEqual({ brandAssets: [], referenceImages: [], colors: [] });
  });

  it('preserves a caller-provided brand bucket', () => {
    const brand: GameBrand = {
      brandAssets: [],
      referenceImages: [],
      colors: [{ hex: '#ff0000', role: 'primary' }],
    };
    const profile = assembleGameProfile({
      appId: '1',
      metadata: META,
      palette: PAL,
      brand,
    });
    expect(profile.brand).toBe(brand);
  });
});
