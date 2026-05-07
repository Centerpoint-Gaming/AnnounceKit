import { useCallback, useEffect, useState } from 'react';
import type {
  BinaryStore,
  GeneratedThumbnail,
  ThumbnailCache,
  ThumbnailRecord,
} from '@announcekit/core';

interface ThumbnailHistoryProps {
  cache: ThumbnailCache;
  binaryStore: BinaryStore;
  appId: string;
  announcementId: string | null;
  /** Bumped each time a new thumbnail is persisted, to trigger a re-fetch. */
  refreshKey: number;
  onSelect: (thumbnail: GeneratedThumbnail) => void;
}

interface PreviewedRecord {
  record: ThumbnailRecord;
  previewUrl: string | null;
}

interface MenuState {
  recordId: string;
  x: number;
  y: number;
}

export function ThumbnailHistory({
  cache,
  binaryStore,
  appId,
  announcementId,
  refreshKey,
  onSelect,
}: ThumbnailHistoryProps) {
  const [items, setItems] = useState<PreviewedRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  // Local refresh counter to refetch after a delete without leaning on parent.
  const [localTick, setLocalTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];

    async function load() {
      const res = await cache.listForAnnouncement(appId, announcementId);
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error.message);
        setItems([]);
        return;
      }
      const previewed: PreviewedRecord[] = await Promise.all(
        res.data.map(async (record) => {
          const got = await binaryStore.get(record.binaryRef);
          if (!got.ok) return { record, previewUrl: null };
          const buf = new ArrayBuffer(got.data.bytes.byteLength);
          new Uint8Array(buf).set(got.data.bytes);
          const url = URL.createObjectURL(
            new Blob([buf], { type: got.data.mimeType }),
          );
          urls.push(url);
          return { record, previewUrl: url };
        }),
      );
      if (cancelled) {
        urls.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      setItems(previewed);
      setError(null);
    }
    load();

    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [cache, binaryStore, appId, announcementId, refreshKey, localTick]);

  const closeMenu = useCallback(() => setMenu(null), []);

  // Dismiss the menu on any click outside, ESC, scroll, or window blur.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    window.addEventListener('click', closeMenu);
    window.addEventListener('contextmenu', closeMenu);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', closeMenu);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('contextmenu', closeMenu);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', closeMenu);
    };
  }, [menu, closeMenu]);

  const handleDelete = useCallback(
    async (recordId: string) => {
      setMenu(null);
      const res = await cache.delete(recordId);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setLocalTick((t) => t + 1);
    },
    [cache],
  );

  if (error) {
    return (
      <div className="text-xs text-red-400">
        Couldn't load history: {error}
      </div>
    );
  }
  if (items.length === 0) return null;

  return (
    <div className="mt-3">
      <div className="text-xs text-gray-500 mb-1.5 flex items-center justify-between">
        <span>
          Previously generated{' '}
          <span className="text-gray-600">({items.length})</span>
        </span>
        {announcementId === null && (
          <span className="text-[10px] text-gray-600">draft</span>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {items.map(({ record, previewUrl }) => (
          <button
            key={record.id}
            onClick={async () => {
              const got = await binaryStore.get(record.binaryRef);
              if (!got.ok) return;
              const dataUrl = await bytesToDataUrl(got.data.bytes, got.data.mimeType);
              onSelect({
                dataUrl,
                mimeType: got.data.mimeType,
                promptUsed: record.prompt,
                model: record.model,
                generatedAt: record.generatedAt,
              });
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              // Stop the window-level handler we install for dismissal so this
              // open doesn't immediately close itself.
              e.stopPropagation();
              setMenu({ recordId: record.id, x: e.clientX, y: e.clientY });
            }}
            className="shrink-0 w-20 h-20 rounded border border-gray-700 hover:border-blue-500 transition-colors overflow-hidden bg-gray-800 relative group"
            title={`${record.model} — ${new Date(record.generatedAt).toLocaleString()}\nRight-click for options`}
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="cached thumbnail"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-600">
                missing
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-black/70 text-[9px] text-gray-300 px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity truncate">
              {new Date(record.generatedAt).toLocaleTimeString()}
            </div>
          </button>
        ))}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onDelete={() => handleDelete(menu.recordId)}
        />
      )}
    </div>
  );
}

function ContextMenu({
  x,
  y,
  onDelete,
}: {
  x: number;
  y: number;
  onDelete: () => void;
}) {
  return (
    <div
      // Position fixed against the viewport so the popup window's chrome
      // doesn't shift the menu. The window-level click listener installed
      // by the parent dismisses this — stop propagation here so internal
      // clicks reach the buttons before the dismiss fires.
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className="fixed z-50 bg-gray-800 border border-gray-700 rounded shadow-lg py-1 min-w-[140px]"
      style={{ left: x, top: y }}
    >
      <button
        onClick={onDelete}
        className="w-full text-left px-3 py-1.5 text-xs text-red-300 hover:bg-red-900/40 hover:text-red-200 transition-colors"
      >
        Remove
      </button>
    </div>
  );
}

async function bytesToDataUrl(bytes: Uint8Array, mimeType: string): Promise<string> {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  const blob = new Blob([buf], { type: mimeType });
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
