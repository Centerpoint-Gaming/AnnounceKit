import { useCallback, useState } from 'react';
import type {
  AssetRole,
  BinaryStore,
  ContextCache,
  GameProfile,
  Result,
} from '@announcekit/core';
import {
  addBrandAsset,
  cacheKeys,
  findBrandAssetByRef,
  findBrandAssetBySteamUrl,
  isAllowedImageMime,
  makeStoredAsset,
  normalizeMime,
} from '@announcekit/core';

interface FetchAssetBytesError {
  reason: string;
  message: string;
  status?: number;
}

interface FetchAssetBytesPayload {
  bytesBase64: string;
  mimeType: string;
  byteCount: number;
}

type FetchAssetBytesResult = Result<FetchAssetBytesPayload, FetchAssetBytesError>;

export interface PromoteCandidate {
  label: string;
  url: string;
  defaultRole: AssetRole;
}

interface UseBrandPromoteOptions {
  /** Null when the popup hasn't loaded a profile yet — promote becomes a no-op. */
  profile: GameProfile | null;
  cache: ContextCache;
  binaryStore: BinaryStore;
  onProfileChange: (next: GameProfile) => void;
}

interface UseBrandPromoteResult {
  promote: (candidate: PromoteCandidate) => Promise<void>;
  busyUrl: string | null;
  error: string | null;
  clearError: () => void;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Shared "fetch a Steam URL → store bytes → add to brand bucket" pipeline.
 * Both the BrandAssets pane and the main-view past-announcements gallery use
 * this so a click in either spot has identical effects (and identical dedup
 * via binaryRef + steam-url lookups).
 */
export function useBrandPromote({
  profile,
  cache,
  binaryStore,
  onProfileChange,
}: UseBrandPromoteOptions): UseBrandPromoteResult {
  const [busyUrl, setBusyUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const promote = useCallback(
    async (candidate: PromoteCandidate) => {
      if (!profile) return;
      if (findBrandAssetBySteamUrl(profile.brand, candidate.url)) return;
      setBusyUrl(candidate.url);
      try {
        const res: FetchAssetBytesResult = await chrome.runtime.sendMessage({
          type: 'FETCH_ASSET_BYTES',
          url: candidate.url,
        });
        if (!res?.ok) {
          setError(res?.error?.message ?? 'Failed to fetch Steam asset');
          return;
        }

        const normalized = normalizeMime(res.data.mimeType);
        if (!isAllowedImageMime(normalized)) {
          setError(`Skipped — type ${res.data.mimeType} not allowed`);
          return;
        }

        const bytes = base64ToBytes(res.data.bytesBase64);
        if (bytes.byteLength === 0) {
          setError('Skipped — empty payload');
          return;
        }

        const put = await binaryStore.put(bytes, normalized);
        if (!put.ok) {
          setError(put.error.message);
          return;
        }

        if (findBrandAssetByRef(profile.brand, put.data.binaryRef)) {
          setError(null);
          return;
        }

        const asset = makeStoredAsset({
          name: `${candidate.label} — ${profile.name}`,
          binaryRef: put.data.binaryRef,
          mimeType: normalized,
          bytes: put.data.byteCount,
          source: 'steam',
          sourceUrl: candidate.url,
          role: candidate.defaultRole,
        });

        const next: GameProfile = {
          ...profile,
          brand: addBrandAsset(profile.brand, asset),
          lastUsedAt: Date.now(),
        };
        await cache.set(cacheKeys.gameProfile(next.appId), next, {
          source: 'brand-promote',
        });
        onProfileChange(next);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusyUrl(null);
      }
    },
    [profile, cache, binaryStore, onProfileChange],
  );

  return {
    promote,
    busyUrl,
    error,
    clearError: useCallback(() => setError(null), []),
  };
}
