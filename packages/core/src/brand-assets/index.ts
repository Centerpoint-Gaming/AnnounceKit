/**
 * Contract: brand-assets
 *
 * Pure helpers for the unified brand-assets bucket on GameProfile. Validation,
 * SHA-256 hashing, immutable add/remove/rename, and dedup lookups.
 *
 * Side-effect-free except `hashBytes`, which calls Web Crypto's SubtleCrypto.
 * Available in browsers, MV3 service workers, and Node ≥19.
 */

import type { Result } from '../result.js';
import { ok, err } from '../result.js';
import type { AssetRole, GameBrand, StoredAsset } from '../profile/types.js';

export const ASSET_ROLES = [
  'logo',
  'character',
  'environment',
  'mood',
  'other',
] as const satisfies readonly AssetRole[];

export function getAssetRole(asset: StoredAsset): AssetRole {
  return asset.role ?? 'other';
}

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

export type BrandAssetErrorReason =
  | 'unsupported-type'
  | 'empty-bytes'
  | 'not-found';

export interface BrandAssetError {
  reason: BrandAssetErrorReason;
  message: string;
}

export function isAllowedImageMime(mime: string): boolean {
  const normalized = mime.toLowerCase();
  // image/jpg is a common-but-incorrect alias users see in extensions.
  if (normalized === 'image/jpg') return true;
  return (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(normalized);
}

export function normalizeMime(mime: string): string {
  const m = mime.toLowerCase();
  return m === 'image/jpg' ? 'image/jpeg' : m;
}

export function validateImageMime(mime: string): Result<void, BrandAssetError> {
  if (!isAllowedImageMime(mime)) {
    return err({
      reason: 'unsupported-type',
      message: `Unsupported image type "${mime}". Allowed: ${ALLOWED_IMAGE_MIME_TYPES.join(', ')}`,
    });
  }
  return ok(undefined);
}

export async function hashBytes(
  bytes: Uint8Array | ArrayBuffer,
): Promise<string> {
  // Copy into a fresh ArrayBuffer to avoid SharedArrayBuffer-typed inputs
  // that Web Crypto rejects, and to detach the digest input from the caller's
  // backing store.
  const view =
    bytes instanceof Uint8Array
      ? bytes
      : new Uint8Array(bytes as ArrayBuffer);
  const buf = new ArrayBuffer(view.byteLength);
  new Uint8Array(buf).set(view);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface MakeStoredAssetInput {
  name: string;
  binaryRef: string;
  mimeType: string;
  bytes: number;
  source: 'upload' | 'steam';
  sourceUrl?: string;
  role?: AssetRole;
  description?: string;
  id?: string;
  addedAt?: number;
}

export function makeStoredAsset(input: MakeStoredAssetInput): StoredAsset {
  return {
    id: input.id ?? crypto.randomUUID(),
    name: input.name,
    binaryRef: input.binaryRef,
    mimeType: input.mimeType,
    bytes: input.bytes,
    source: input.source,
    sourceUrl: input.sourceUrl,
    role: input.role,
    description: input.description,
    addedAt: input.addedAt ?? Date.now(),
  };
}

export function findBrandAssetByRef(
  brand: GameBrand,
  binaryRef: string,
): StoredAsset | undefined {
  return brand.brandAssets.find((a) => a.binaryRef === binaryRef);
}

export function findBrandAssetBySteamUrl(
  brand: GameBrand,
  sourceUrl: string,
): StoredAsset | undefined {
  return brand.brandAssets.find(
    (a) => a.source === 'steam' && a.sourceUrl === sourceUrl,
  );
}

/**
 * Add an asset to the bucket. Same-content uploads (matching binaryRef)
 * collapse to the existing row, so callers don't have to dedup themselves.
 */
export function addBrandAsset(
  brand: GameBrand,
  asset: StoredAsset,
): GameBrand {
  if (brand.brandAssets.some((a) => a.binaryRef === asset.binaryRef)) {
    return brand;
  }
  return { ...brand, brandAssets: [...brand.brandAssets, asset] };
}

export function removeBrandAsset(brand: GameBrand, id: string): GameBrand {
  return {
    ...brand,
    brandAssets: brand.brandAssets.filter((a) => a.id !== id),
  };
}

export function renameBrandAsset(
  brand: GameBrand,
  id: string,
  name: string,
): Result<GameBrand, BrandAssetError> {
  if (!brand.brandAssets.some((a) => a.id === id)) {
    return err({ reason: 'not-found', message: `No brand asset with id ${id}` });
  }
  return ok({
    ...brand,
    brandAssets: brand.brandAssets.map((a) =>
      a.id === id ? { ...a, name } : a,
    ),
  });
}

export function setBrandAssetRole(
  brand: GameBrand,
  id: string,
  role: AssetRole | undefined,
): Result<GameBrand, BrandAssetError> {
  if (!brand.brandAssets.some((a) => a.id === id)) {
    return err({ reason: 'not-found', message: `No brand asset with id ${id}` });
  }
  return ok({
    ...brand,
    brandAssets: brand.brandAssets.map((a) =>
      a.id === id ? { ...a, role } : a,
    ),
  });
}

export function setBrandAssetDescription(
  brand: GameBrand,
  id: string,
  description: string | undefined,
): Result<GameBrand, BrandAssetError> {
  if (!brand.brandAssets.some((a) => a.id === id)) {
    return err({ reason: 'not-found', message: `No brand asset with id ${id}` });
  }
  const trimmed = description?.trim();
  return ok({
    ...brand,
    brandAssets: brand.brandAssets.map((a) =>
      a.id === id ? { ...a, description: trimmed || undefined } : a,
    ),
  });
}

// ─── Reference images ────────────────────────────────────────────────────────
//
// Reference images are a separate bucket from brand assets — they represent
// approved layouts / compositions, not identity ingredients. Same StoredAsset
// shape, same dedup-by-binaryRef rule, but the prompt builder reads them as
// "match this format" rather than "incorporate this element."

export function findReferenceImageByRef(
  brand: GameBrand,
  binaryRef: string,
): StoredAsset | undefined {
  return brand.referenceImages.find((a) => a.binaryRef === binaryRef);
}

export function addReferenceImage(
  brand: GameBrand,
  asset: StoredAsset,
): GameBrand {
  if (brand.referenceImages.some((a) => a.binaryRef === asset.binaryRef)) {
    return brand;
  }
  return { ...brand, referenceImages: [...brand.referenceImages, asset] };
}

export function removeReferenceImage(brand: GameBrand, id: string): GameBrand {
  return {
    ...brand,
    referenceImages: brand.referenceImages.filter((a) => a.id !== id),
  };
}

export function renameReferenceImage(
  brand: GameBrand,
  id: string,
  name: string,
): Result<GameBrand, BrandAssetError> {
  if (!brand.referenceImages.some((a) => a.id === id)) {
    return err({ reason: 'not-found', message: `No reference image with id ${id}` });
  }
  return ok({
    ...brand,
    referenceImages: brand.referenceImages.map((a) =>
      a.id === id ? { ...a, name } : a,
    ),
  });
}

export function setReferenceImageDescription(
  brand: GameBrand,
  id: string,
  description: string | undefined,
): Result<GameBrand, BrandAssetError> {
  if (!brand.referenceImages.some((a) => a.id === id)) {
    return err({ reason: 'not-found', message: `No reference image with id ${id}` });
  }
  const trimmed = description?.trim();
  return ok({
    ...brand,
    referenceImages: brand.referenceImages.map((a) =>
      a.id === id ? { ...a, description: trimmed || undefined } : a,
    ),
  });
}
