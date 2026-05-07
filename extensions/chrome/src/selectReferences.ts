import type { AssetRole, GameBrand, StoredAsset } from '@announcekit/core';

// Single source of truth for which images get sent to Gemini, split by
// purpose: brand assets (identity ingredients) and reference images (layout
// templates). Both the service worker (when generating) and the popup's
// Prompt debug tab (when previewing) call these — they MUST agree or the
// preview lies.

export const MAX_BRAND_ASSETS = 4;
export const MAX_REFERENCE_IMAGES = 2;

const ROLE_PRIORITY: Record<AssetRole, number> = {
  logo: 0,
  character: 1,
  environment: 2,
  mood: 3,
  other: 4,
};

export interface ReferenceSelection {
  selected: StoredAsset[];
  skipped: StoredAsset[];
}

export function selectBrandAssets(brand: GameBrand): ReferenceSelection {
  const ranked = [...brand.brandAssets].sort(
    (a, b) =>
      (ROLE_PRIORITY[a.role ?? 'other'] - ROLE_PRIORITY[b.role ?? 'other']) ||
      a.addedAt - b.addedAt,
  );
  return {
    selected: ranked.slice(0, MAX_BRAND_ASSETS),
    skipped: ranked.slice(MAX_BRAND_ASSETS),
  };
}

export function selectReferenceImages(brand: GameBrand): ReferenceSelection {
  // No role priority — reference images are uniformly layout templates.
  // Oldest-first keeps the list stable as the user adds new ones.
  const ranked = [...brand.referenceImages].sort(
    (a, b) => a.addedAt - b.addedAt,
  );
  return {
    selected: ranked.slice(0, MAX_REFERENCE_IMAGES),
    skipped: ranked.slice(MAX_REFERENCE_IMAGES),
  };
}
