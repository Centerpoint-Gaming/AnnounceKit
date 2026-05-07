import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AssetRole,
  BinaryStore,
  ContextCache,
  GameProfile,
  Result,
  StoredAsset,
} from '@announcekit/core';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  ASSET_ROLES,
  addBrandAsset,
  cacheKeys,
  findBrandAssetByRef,
  findBrandAssetBySteamUrl,
  getAssetRole,
  isAllowedImageMime,
  makeStoredAsset,
  normalizeMime,
  removeBrandAsset,
  renameBrandAsset,
  setBrandAssetDescription,
  setBrandAssetRole,
} from '@announcekit/core';
import { PastAnnouncements } from './PastAnnouncements';

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

interface BrandAssetsProps {
  profile: GameProfile;
  cache: ContextCache;
  binaryStore: BinaryStore;
  clanAccountId: string | null;
  onProfileChange: (next: GameProfile) => void;
}

interface SteamCandidate {
  label: string;
  url: string;
  defaultRole: AssetRole;
}

const ACCEPT = ALLOWED_IMAGE_MIME_TYPES.join(',');

const ROLE_LABELS: Record<AssetRole, string> = {
  logo: 'Logo',
  character: 'Character',
  environment: 'Environment',
  mood: 'Mood',
  other: 'Other',
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function steamCandidates(profile: GameProfile): SteamCandidate[] {
  const out: SteamCandidate[] = [];
  if (profile.storeAssets.headerCapsule) {
    out.push({
      label: 'Header',
      url: profile.storeAssets.headerCapsule,
      defaultRole: 'environment',
    });
  }
  if (profile.storeAssets.heroImage) {
    out.push({
      label: 'Hero',
      url: profile.storeAssets.heroImage,
      defaultRole: 'environment',
    });
  }
  if (profile.storeAssets.logo) {
    out.push({
      label: 'Logo',
      url: profile.storeAssets.logo,
      defaultRole: 'logo',
    });
  }
  profile.storeAssets.screenshots.forEach((url, i) => {
    out.push({
      label: `Screenshot ${i + 1}`,
      url,
      defaultRole: 'other',
    });
  });
  return out;
}

export function BrandAssets({
  profile,
  cache,
  binaryStore,
  clanAccountId,
  onProfileChange,
}: BrandAssetsProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [descDrafts, setDescDrafts] = useState<Record<string, string>>({});
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const candidates = useMemo(() => steamCandidates(profile), [profile]);

  // Lazy-load blob URLs for assets we don't have a preview for yet.
  useEffect(() => {
    let cancelled = false;
    const missing = profile.brand.brandAssets
      .map((a) => a.binaryRef)
      .filter((ref) => !(ref in previews));

    if (missing.length === 0) return;

    (async () => {
      const updates: Record<string, string> = {};
      for (const ref of missing) {
        const r = await binaryStore.get(ref);
        if (cancelled) return;
        if (r.ok) {
          // Copy into a fresh ArrayBuffer so the Blob ctor accepts it under
          // strict lib.dom typings (Uint8Array can be backed by SAB).
          const owned = new Uint8Array(r.data.byteCount);
          owned.set(r.data.bytes);
          const blob = new Blob([owned.buffer], { type: r.data.mimeType });
          updates[ref] = URL.createObjectURL(blob);
        }
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setPreviews((p) => ({ ...p, ...updates }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profile.brand.brandAssets, binaryStore, previews]);

  // Revoke blob URLs on unmount.
  useEffect(() => {
    return () => {
      for (const url of Object.values(previews)) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback(
    async (next: GameProfile) => {
      await cache.set(cacheKeys.gameProfile(next.appId), next, {
        source: 'brand-assets',
      });
      onProfileChange(next);
    },
    [cache, onProfileChange],
  );

  const ingestBytes = useCallback(
    async (
      bytes: Uint8Array,
      mimeType: string,
      name: string,
      source: 'upload' | 'steam',
      sourceUrl?: string,
      role?: AssetRole,
    ): Promise<void> => {
      const normalized = normalizeMime(mimeType);
      if (!isAllowedImageMime(normalized)) {
        setError(`Skipped "${name}" — type ${mimeType} not allowed`);
        return;
      }
      if (bytes.byteLength === 0) {
        setError(`Skipped "${name}" — file is empty`);
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
        name,
        binaryRef: put.data.binaryRef,
        mimeType: normalized,
        bytes: put.data.byteCount,
        source,
        sourceUrl,
        role,
      });
      await persist({
        ...profile,
        brand: addBrandAsset(profile.brand, asset),
        lastUsedAt: Date.now(),
      });
      setError(null);
    },
    [profile, binaryStore, persist],
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      setBusy('uploading');
      try {
        for (const file of Array.from(files)) {
          if (!isAllowedImageMime(file.type)) {
            setError(`Skipped "${file.name}" — type ${file.type} not allowed`);
            continue;
          }
          const buf = new Uint8Array(await file.arrayBuffer());
          await ingestBytes(buf, file.type, file.name, 'upload');
        }
      } finally {
        setBusy(null);
      }
    },
    [ingestBytes],
  );

  const handlePromoteSteam = useCallback(
    async (candidate: SteamCandidate) => {
      if (findBrandAssetBySteamUrl(profile.brand, candidate.url)) return;
      setBusy(`promote:${candidate.url}`);
      try {
        const res: FetchAssetBytesResult = await chrome.runtime.sendMessage({
          type: 'FETCH_ASSET_BYTES',
          url: candidate.url,
        });
        if (!res?.ok) {
          setError(res?.error?.message ?? 'Failed to fetch Steam asset');
          return;
        }
        const bytes = base64ToBytes(res.data.bytesBase64);
        await ingestBytes(
          bytes,
          res.data.mimeType,
          `${candidate.label} — ${profile.name}`,
          'steam',
          candidate.url,
          candidate.defaultRole,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [profile.brand, profile.name, ingestBytes],
  );

  const handleDelete = useCallback(
    async (asset: StoredAsset) => {
      const url = previews[asset.binaryRef];
      if (url) URL.revokeObjectURL(url);
      setPreviews((p) => {
        const next = { ...p };
        delete next[asset.binaryRef];
        return next;
      });
      const nextBrand = removeBrandAsset(profile.brand, asset.id);
      const stillReferenced = nextBrand.brandAssets.some(
        (a) => a.binaryRef === asset.binaryRef,
      );
      if (!stillReferenced) {
        await binaryStore.delete(asset.binaryRef);
      }
      await persist({
        ...profile,
        brand: nextBrand,
        lastUsedAt: Date.now(),
      });
    },
    [profile, previews, binaryStore, persist],
  );

  const startRename = useCallback((asset: StoredAsset) => {
    setEditingId(asset.id);
    setDraftName(asset.name);
  }, []);

  const commitRename = useCallback(async () => {
    if (!editingId) return;
    const trimmed = draftName.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    const r = renameBrandAsset(profile.brand, editingId, trimmed);
    if (!r.ok) {
      setError(r.error.message);
      setEditingId(null);
      return;
    }
    await persist({ ...profile, brand: r.data, lastUsedAt: Date.now() });
    setEditingId(null);
  }, [editingId, draftName, profile, persist]);

  const handleRoleChange = useCallback(
    async (assetId: string, role: AssetRole) => {
      const r = setBrandAssetRole(profile.brand, assetId, role);
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      await persist({ ...profile, brand: r.data, lastUsedAt: Date.now() });
    },
    [profile, persist],
  );

  const commitDescription = useCallback(
    async (assetId: string) => {
      const value = descDrafts[assetId];
      const r = setBrandAssetDescription(profile.brand, assetId, value);
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      await persist({ ...profile, brand: r.data, lastUsedAt: Date.now() });
    },
    [descDrafts, profile, persist],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await handleFiles(files);
    }
  };

  const assets = profile.brand.brandAssets;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
          Brand Assets
        </h3>
        <span className="text-xs text-gray-600">{assets.length} saved</span>
      </div>

      {/* Drag/drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          dragActive
            ? 'border-blue-500 bg-blue-500/10'
            : 'border-gray-700 hover:border-gray-600 bg-gray-800/30'
        }`}
        role="button"
        tabIndex={0}
      >
        <p className="text-xs text-gray-400">
          {busy === 'uploading'
            ? 'Uploading…'
            : 'Drag images here or click to upload'}
        </p>
        <p className="text-[10px] text-gray-600 mt-1">
          PNG, JPEG, WebP, GIF — multiple OK
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) {
              void handleFiles(e.target.files);
              e.target.value = '';
            }
          }}
        />
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-300 bg-red-900/30 border border-red-800 rounded p-2 break-words">
          {error}
        </p>
      )}

      {/* Saved assets grid */}
      {assets.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {assets.map((asset) => {
            const preview = previews[asset.binaryRef];
            const isEditing = editingId === asset.id;
            return (
              <div
                key={asset.id}
                className="relative group bg-gray-800/40 rounded border border-gray-700 overflow-hidden"
              >
                {preview ? (
                  <img
                    src={preview}
                    alt={asset.name}
                    className="w-full aspect-video object-cover"
                  />
                ) : (
                  <div className="w-full aspect-video flex items-center justify-center text-[10px] text-gray-600">
                    loading…
                  </div>
                )}
                <span
                  className={`absolute top-1 left-1 text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wide ${
                    asset.source === 'steam'
                      ? 'bg-purple-900/80 text-purple-200'
                      : 'bg-blue-900/80 text-blue-200'
                  }`}
                >
                  {asset.source}
                </span>
                <div className="p-1.5 text-[10px] space-y-1">
                  {isEditing ? (
                    <input
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onBlur={() => void commitRename()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void commitRename();
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      autoFocus
                      className="w-full bg-gray-900 border border-gray-600 rounded px-1 py-0.5 text-white"
                    />
                  ) : (
                    <div className="flex items-center justify-between gap-1">
                      <button
                        onClick={() => startRename(asset)}
                        className="truncate text-left text-gray-300 hover:text-white flex-1"
                        title={asset.name}
                      >
                        {asset.name}
                      </button>
                      <button
                        onClick={() => void handleDelete(asset)}
                        className="text-gray-600 hover:text-red-400 px-0.5"
                        title="Remove"
                        aria-label="Remove brand asset"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-1">
                    <select
                      value={getAssetRole(asset)}
                      onChange={(e) =>
                        void handleRoleChange(
                          asset.id,
                          e.target.value as AssetRole,
                        )
                      }
                      className="bg-gray-900 border border-gray-700 rounded text-[10px] text-gray-300 px-1 py-0.5 focus:outline-none focus:border-blue-500"
                      aria-label="Asset role"
                    >
                      {ASSET_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    <span className="text-gray-600">
                      {formatBytes(asset.bytes)}
                    </span>
                  </div>
                  <textarea
                    value={descDrafts[asset.id] ?? asset.description ?? ''}
                    onChange={(e) =>
                      setDescDrafts((d) => ({
                        ...d,
                        [asset.id]: e.target.value,
                      }))
                    }
                    onBlur={() => void commitDescription(asset.id)}
                    placeholder="Notes for the model (optional)"
                    rows={2}
                    className="w-full bg-gray-900 border border-gray-700 rounded text-[10px] text-gray-300 placeholder-gray-600 px-1 py-1 focus:outline-none focus:border-blue-500 resize-none"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Promote-from-Steam strip */}
      {candidates.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Add from Steam
          </h4>
          <div className="grid grid-cols-3 gap-1.5">
            {candidates.map((c) => {
              const promoted = !!findBrandAssetBySteamUrl(profile.brand, c.url);
              const isBusy = busy === `promote:${c.url}`;
              return (
                <button
                  key={c.url}
                  onClick={() => void handlePromoteSteam(c)}
                  disabled={promoted || isBusy}
                  title={promoted ? 'Already added' : `Add ${c.label}`}
                  className="relative group rounded overflow-hidden border border-gray-700 hover:border-gray-500 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <img
                    src={c.url}
                    alt={c.label}
                    className="w-full aspect-video object-cover"
                    loading="lazy"
                  />
                  <span className="absolute inset-x-0 bottom-0 text-[9px] bg-black/70 text-white px-1 py-0.5 truncate">
                    {c.label}
                  </span>
                  {promoted && (
                    <span className="absolute top-0.5 right-0.5 text-[9px] bg-green-600 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center">
                      ✓
                    </span>
                  )}
                  {isBusy && (
                    <span className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <PastAnnouncements
        appId={profile.appId}
        clanAccountId={clanAccountId}
        brand={profile.brand}
        cache={cache}
        onPromote={handlePromoteSteam}
      />
    </div>
  );
}
