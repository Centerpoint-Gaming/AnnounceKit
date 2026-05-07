import { describe, it, expect } from 'vitest';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  ASSET_ROLES,
  addBrandAsset,
  addReferenceImage,
  findBrandAssetByRef,
  findBrandAssetBySteamUrl,
  findReferenceImageByRef,
  getAssetRole,
  hashBytes,
  isAllowedImageMime,
  makeStoredAsset,
  normalizeMime,
  removeBrandAsset,
  removeReferenceImage,
  renameBrandAsset,
  renameReferenceImage,
  setBrandAssetRole,
  setReferenceImageDescription,
  validateImageMime,
} from '../../src/brand-assets/index.js';
import type { GameBrand, StoredAsset } from '../../src/profile/types.js';

function emptyBrand(): GameBrand {
  return { brandAssets: [], referenceImages: [], colors: [] };
}

function fixedAsset(overrides: Partial<StoredAsset> = {}): StoredAsset {
  return {
    id: 'asset-1',
    name: 'logo.png',
    binaryRef: 'a'.repeat(64),
    mimeType: 'image/png',
    bytes: 1024,
    source: 'upload',
    addedAt: 1700000000000,
    ...overrides,
  };
}

describe('isAllowedImageMime / validateImageMime', () => {
  it('accepts every declared allowed type', () => {
    for (const m of ALLOWED_IMAGE_MIME_TYPES) {
      expect(isAllowedImageMime(m)).toBe(true);
      expect(validateImageMime(m).ok).toBe(true);
    }
  });

  it('accepts the image/jpg alias and normalizes it to image/jpeg', () => {
    expect(isAllowedImageMime('image/jpg')).toBe(true);
    expect(normalizeMime('image/jpg')).toBe('image/jpeg');
  });

  it('is case-insensitive', () => {
    expect(isAllowedImageMime('IMAGE/PNG')).toBe(true);
  });

  it('rejects non-image and non-allowed types', () => {
    for (const m of ['image/svg+xml', 'image/bmp', 'application/pdf', 'text/plain']) {
      expect(isAllowedImageMime(m)).toBe(false);
      const v = validateImageMime(m);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.error.reason).toBe('unsupported-type');
    }
  });
});

describe('hashBytes', () => {
  it('produces the canonical SHA-256 hex for the empty buffer', async () => {
    const empty = new Uint8Array(0);
    const h = await hashBytes(empty);
    expect(h).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('produces the canonical SHA-256 hex for "abc"', async () => {
    const abc = new TextEncoder().encode('abc');
    const h = await hashBytes(abc);
    expect(h).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('is deterministic across calls and across input shapes', async () => {
    const data = new TextEncoder().encode('determinism check');
    const h1 = await hashBytes(data);
    const h2 = await hashBytes(data);
    const h3 = await hashBytes(data.buffer.slice(0));
    expect(h1).toBe(h2);
    expect(h1).toBe(h3);
  });
});

describe('makeStoredAsset', () => {
  it('uses provided id and addedAt verbatim when supplied', () => {
    const a = makeStoredAsset({
      name: 'x.png',
      binaryRef: 'r',
      mimeType: 'image/png',
      bytes: 10,
      source: 'upload',
      id: 'fixed-id',
      addedAt: 42,
    });
    expect(a.id).toBe('fixed-id');
    expect(a.addedAt).toBe(42);
  });

  it('auto-generates id and addedAt when omitted', () => {
    const a = makeStoredAsset({
      name: 'x.png',
      binaryRef: 'r',
      mimeType: 'image/png',
      bytes: 10,
      source: 'upload',
    });
    expect(typeof a.id).toBe('string');
    expect(a.id.length).toBeGreaterThan(0);
    expect(typeof a.addedAt).toBe('number');
  });
});

describe('add / remove / rename / find', () => {
  it('addBrandAsset appends new content', () => {
    const next = addBrandAsset(emptyBrand(), fixedAsset());
    expect(next.brandAssets).toHaveLength(1);
  });

  it('addBrandAsset dedups by binaryRef (same content collapses)', () => {
    const start = addBrandAsset(emptyBrand(), fixedAsset({ id: 'a' }));
    const next = addBrandAsset(start, fixedAsset({ id: 'b' }));
    expect(next.brandAssets).toHaveLength(1);
    expect(next.brandAssets[0]!.id).toBe('a');
  });

  it('addBrandAsset is immutable', () => {
    const before = emptyBrand();
    const after = addBrandAsset(before, fixedAsset());
    expect(before.brandAssets).toHaveLength(0);
    expect(after).not.toBe(before);
  });

  it('removeBrandAsset removes the matching id and leaves others alone', () => {
    const brand = addBrandAsset(
      addBrandAsset(emptyBrand(), fixedAsset({ id: 'a', binaryRef: 'r1' })),
      fixedAsset({ id: 'b', binaryRef: 'r2' }),
    );
    const next = removeBrandAsset(brand, 'a');
    expect(next.brandAssets).toHaveLength(1);
    expect(next.brandAssets[0]!.id).toBe('b');
  });

  it('removeBrandAsset on unknown id is a no-op (returns equivalent shape)', () => {
    const brand = addBrandAsset(emptyBrand(), fixedAsset());
    const next = removeBrandAsset(brand, 'missing');
    expect(next.brandAssets).toHaveLength(1);
  });

  it('renameBrandAsset updates the name', () => {
    const brand = addBrandAsset(emptyBrand(), fixedAsset({ id: 'a', name: 'old.png' }));
    const r = renameBrandAsset(brand, 'a', 'new.png');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.brandAssets[0]!.name).toBe('new.png');
  });

  it('renameBrandAsset on unknown id returns not-found', () => {
    const r = renameBrandAsset(emptyBrand(), 'missing', 'x');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.reason).toBe('not-found');
  });

  it('findBrandAssetByRef returns the matching row or undefined', () => {
    const brand = addBrandAsset(emptyBrand(), fixedAsset({ binaryRef: 'r1' }));
    expect(findBrandAssetByRef(brand, 'r1')?.binaryRef).toBe('r1');
    expect(findBrandAssetByRef(brand, 'nope')).toBeUndefined();
  });

  it('findBrandAssetBySteamUrl only matches steam-sourced rows', () => {
    const url = 'https://cdn.steam/x.jpg';
    const brand: GameBrand = {
      colors: [],
      referenceImages: [],
      brandAssets: [
        fixedAsset({ id: 'u', source: 'upload', sourceUrl: url, binaryRef: 'r1' }),
        fixedAsset({ id: 's', source: 'steam', sourceUrl: url, binaryRef: 'r2' }),
      ],
    };
    expect(findBrandAssetBySteamUrl(brand, url)?.id).toBe('s');
  });
});

describe('AssetRole + setBrandAssetRole', () => {
  it('exposes the canonical role list', () => {
    expect(ASSET_ROLES).toEqual([
      'logo',
      'character',
      'environment',
      'mood',
      'other',
    ]);
  });

  it("getAssetRole defaults missing role to 'other'", () => {
    expect(getAssetRole(fixedAsset())).toBe('other');
    expect(getAssetRole(fixedAsset({ role: 'logo' }))).toBe('logo');
  });

  it('makeStoredAsset persists the role when given', () => {
    const a = makeStoredAsset({
      name: 'wordmark.png',
      binaryRef: 'r',
      mimeType: 'image/png',
      bytes: 10,
      source: 'upload',
      role: 'logo',
    });
    expect(a.role).toBe('logo');
  });

  it('makeStoredAsset leaves role undefined when omitted', () => {
    const a = makeStoredAsset({
      name: 'x.png',
      binaryRef: 'r',
      mimeType: 'image/png',
      bytes: 10,
      source: 'upload',
    });
    expect(a.role).toBeUndefined();
  });

  it('setBrandAssetRole updates the role on the matching asset', () => {
    const brand = addBrandAsset(emptyBrand(), fixedAsset({ id: 'a' }));
    const r = setBrandAssetRole(brand, 'a', 'character');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.brandAssets[0]!.role).toBe('character');
  });

  it('setBrandAssetRole accepts undefined to clear the role', () => {
    const brand = addBrandAsset(
      emptyBrand(),
      fixedAsset({ id: 'a', role: 'logo' }),
    );
    const r = setBrandAssetRole(brand, 'a', undefined);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.brandAssets[0]!.role).toBeUndefined();
  });

  it('setBrandAssetRole on unknown id returns not-found', () => {
    const r = setBrandAssetRole(emptyBrand(), 'missing', 'logo');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.reason).toBe('not-found');
  });

  it('setBrandAssetRole is immutable — original brand unchanged', () => {
    const before = addBrandAsset(emptyBrand(), fixedAsset({ id: 'a' }));
    const r = setBrandAssetRole(before, 'a', 'mood');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(before.brandAssets[0]!.role).toBeUndefined();
    expect(r.data).not.toBe(before);
  });
});

describe('reference image CRUD', () => {
  it('addReferenceImage appends new content into the referenceImages bucket', () => {
    const next = addReferenceImage(emptyBrand(), fixedAsset());
    expect(next.referenceImages).toHaveLength(1);
    expect(next.brandAssets).toHaveLength(0);
  });

  it('addReferenceImage dedups by binaryRef', () => {
    const start = addReferenceImage(emptyBrand(), fixedAsset({ id: 'a' }));
    const next = addReferenceImage(start, fixedAsset({ id: 'b' }));
    expect(next.referenceImages).toHaveLength(1);
    expect(next.referenceImages[0]!.id).toBe('a');
  });

  it('reference and brand buckets are independent', () => {
    const brand = addBrandAsset(emptyBrand(), fixedAsset({ id: 'b', binaryRef: 'r1' }));
    const both = addReferenceImage(brand, fixedAsset({ id: 'r', binaryRef: 'r2' }));
    expect(both.brandAssets).toHaveLength(1);
    expect(both.referenceImages).toHaveLength(1);
  });

  it('removeReferenceImage removes from the right bucket', () => {
    const brand = addReferenceImage(
      addReferenceImage(emptyBrand(), fixedAsset({ id: 'a', binaryRef: 'r1' })),
      fixedAsset({ id: 'b', binaryRef: 'r2' }),
    );
    const next = removeReferenceImage(brand, 'a');
    expect(next.referenceImages).toHaveLength(1);
    expect(next.referenceImages[0]!.id).toBe('b');
  });

  it('renameReferenceImage updates the name', () => {
    const brand = addReferenceImage(
      emptyBrand(),
      fixedAsset({ id: 'a', name: 'old.png' }),
    );
    const r = renameReferenceImage(brand, 'a', 'new.png');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.referenceImages[0]!.name).toBe('new.png');
  });

  it('renameReferenceImage on unknown id returns not-found', () => {
    const r = renameReferenceImage(emptyBrand(), 'missing', 'x');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.reason).toBe('not-found');
  });

  it('setReferenceImageDescription stores trimmed description', () => {
    const brand = addReferenceImage(emptyBrand(), fixedAsset({ id: 'a' }));
    const r = setReferenceImageDescription(brand, 'a', '  diagonal split layout  ');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.referenceImages[0]!.description).toBe('diagonal split layout');
  });

  it('setReferenceImageDescription clears empty/whitespace input', () => {
    const brand = addReferenceImage(
      emptyBrand(),
      fixedAsset({ id: 'a', description: 'old' }),
    );
    const r = setReferenceImageDescription(brand, 'a', '   ');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.referenceImages[0]!.description).toBeUndefined();
  });

  it('findReferenceImageByRef looks only in the reference bucket', () => {
    const brand = addReferenceImage(
      addBrandAsset(emptyBrand(), fixedAsset({ id: 'b', binaryRef: 'r1' })),
      fixedAsset({ id: 'r', binaryRef: 'r2' }),
    );
    expect(findReferenceImageByRef(brand, 'r2')?.id).toBe('r');
    expect(findReferenceImageByRef(brand, 'r1')).toBeUndefined();
  });
});
