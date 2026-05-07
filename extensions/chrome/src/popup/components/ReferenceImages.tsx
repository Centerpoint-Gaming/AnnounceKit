import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BinaryStore,
  ContextCache,
  GameProfile,
  StoredAsset,
} from '@announcekit/core';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  addReferenceImage,
  cacheKeys,
  findReferenceImageByRef,
  isAllowedImageMime,
  makeStoredAsset,
  normalizeMime,
  removeReferenceImage,
  renameReferenceImage,
  setReferenceImageDescription,
} from '@announcekit/core';

interface ReferenceImagesProps {
  profile: GameProfile;
  cache: ContextCache;
  binaryStore: BinaryStore;
  onProfileChange: (next: GameProfile) => void;
}

const ACCEPT = ALLOWED_IMAGE_MIME_TYPES.join(',');

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function ReferenceImages({
  profile,
  cache,
  binaryStore,
  onProfileChange,
}: ReferenceImagesProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lazy-load blob URLs we don't have a preview for yet.
  useEffect(() => {
    let cancelled = false;
    const missing = profile.brand.referenceImages
      .map((a) => a.binaryRef)
      .filter((ref) => !(ref in previews));

    if (missing.length === 0) return;

    (async () => {
      const updates: Record<string, string> = {};
      for (const ref of missing) {
        const r = await binaryStore.get(ref);
        if (cancelled) return;
        if (r.ok) {
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
  }, [profile.brand.referenceImages, binaryStore, previews]);

  useEffect(() => {
    return () => {
      for (const url of Object.values(previews)) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback(
    async (next: GameProfile) => {
      await cache.set(cacheKeys.gameProfile(next.appId), next, {
        source: 'reference-images',
      });
      onProfileChange(next);
    },
    [cache, onProfileChange],
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      setBusy(true);
      try {
        for (const file of Array.from(files)) {
          if (!isAllowedImageMime(file.type)) {
            setError(`Skipped "${file.name}" — type ${file.type} not allowed`);
            continue;
          }
          const buf = new Uint8Array(await file.arrayBuffer());
          const normalized = normalizeMime(file.type);
          if (buf.byteLength === 0) {
            setError(`Skipped "${file.name}" — file is empty`);
            continue;
          }
          const put = await binaryStore.put(buf, normalized);
          if (!put.ok) {
            setError(put.error.message);
            continue;
          }
          if (findReferenceImageByRef(profile.brand, put.data.binaryRef)) {
            continue;
          }
          const asset = makeStoredAsset({
            name: file.name,
            binaryRef: put.data.binaryRef,
            mimeType: normalized,
            bytes: put.data.byteCount,
            source: 'upload',
          });
          await persist({
            ...profile,
            brand: addReferenceImage(profile.brand, asset),
            lastUsedAt: Date.now(),
          });
          setError(null);
        }
      } finally {
        setBusy(false);
      }
    },
    [profile, binaryStore, persist],
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
      const nextBrand = removeReferenceImage(profile.brand, asset.id);
      // Only delete bytes if they aren't referenced by brand assets either.
      const stillReferencedHere = nextBrand.referenceImages.some(
        (a) => a.binaryRef === asset.binaryRef,
      );
      const referencedByBrand = nextBrand.brandAssets.some(
        (a) => a.binaryRef === asset.binaryRef,
      );
      if (!stillReferencedHere && !referencedByBrand) {
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
    setEditingNameId(asset.id);
    setDraftName(asset.name);
  }, []);

  const commitRename = useCallback(async () => {
    if (!editingNameId) return;
    const trimmed = draftName.trim();
    if (!trimmed) {
      setEditingNameId(null);
      return;
    }
    const r = renameReferenceImage(profile.brand, editingNameId, trimmed);
    if (!r.ok) {
      setError(r.error.message);
      setEditingNameId(null);
      return;
    }
    await persist({ ...profile, brand: r.data, lastUsedAt: Date.now() });
    setEditingNameId(null);
  }, [editingNameId, draftName, profile, persist]);

  const commitDescription = useCallback(
    async (id: string) => {
      const value = drafts[id];
      const r = setReferenceImageDescription(profile.brand, id, value);
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      await persist({ ...profile, brand: r.data, lastUsedAt: Date.now() });
    },
    [drafts, profile, persist],
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
    if (e.dataTransfer.files?.length) {
      await handleFiles(e.dataTransfer.files);
    }
  };

  const items = profile.brand.referenceImages;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
          Reference Images
        </h3>
        <span className="text-xs text-gray-600">{items.length} saved</span>
      </div>

      <p className="text-xs text-gray-500 mb-2">
        Approved layouts the model should match — composition, framing,
        focal placement. Identity comes from Brand Assets above.
      </p>

      <div
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          dragActive
            ? 'border-purple-500 bg-purple-500/10'
            : 'border-gray-700 hover:border-gray-600 bg-gray-800/30'
        }`}
        role="button"
        tabIndex={0}
      >
        <p className="text-xs text-gray-400">
          {busy ? 'Uploading…' : 'Drag a thumbnail layout here or click to upload'}
        </p>
        <p className="text-[10px] text-gray-600 mt-1">
          PNG, JPEG, WebP, GIF
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

      {items.length > 0 && (
        <div className="mt-3 space-y-2">
          {items.map((asset) => {
            const preview = previews[asset.binaryRef];
            const isEditingName = editingNameId === asset.id;
            const draft = drafts[asset.id] ?? asset.description ?? '';
            return (
              <div
                key={asset.id}
                className="bg-gray-800/40 rounded border border-gray-700 overflow-hidden"
              >
                <div className="flex gap-2 p-2">
                  <div className="w-24 shrink-0">
                    {preview ? (
                      <img
                        src={preview}
                        alt={asset.name}
                        className="w-full aspect-video object-cover rounded"
                      />
                    ) : (
                      <div className="w-full aspect-video flex items-center justify-center text-[10px] text-gray-600 bg-gray-900 rounded">
                        loading…
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      {isEditingName ? (
                        <input
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          onBlur={() => void commitRename()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void commitRename();
                            if (e.key === 'Escape') setEditingNameId(null);
                          }}
                          autoFocus
                          className="flex-1 bg-gray-900 border border-gray-600 rounded px-1.5 py-0.5 text-xs text-white"
                        />
                      ) : (
                        <button
                          onClick={() => startRename(asset)}
                          className="truncate text-left text-xs text-gray-200 hover:text-white flex-1"
                          title={asset.name}
                        >
                          {asset.name}
                        </button>
                      )}
                      <button
                        onClick={() => void handleDelete(asset)}
                        className="text-gray-600 hover:text-red-400 px-1 text-base leading-none"
                        title="Remove"
                        aria-label="Remove reference image"
                      >
                        ×
                      </button>
                    </div>
                    <textarea
                      value={draft}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [asset.id]: e.target.value }))
                      }
                      onBlur={() => void commitDescription(asset.id)}
                      placeholder="What do you like about this reference? (optional)"
                      rows={2}
                      className="w-full bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500 resize-none"
                    />
                    <div className="text-[10px] text-gray-600">
                      {asset.mimeType} · {formatBytes(asset.bytes)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
