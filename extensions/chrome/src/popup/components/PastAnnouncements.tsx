import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AppEvent,
  AssetRole,
  ContextCache,
  GameBrand,
} from '@announcekit/core';
import { cacheKeys, findBrandAssetBySteamUrl } from '@announcekit/core';

const TTL_MS = 60 * 60 * 1000; // 1 hour

interface FetchAppEventsResponse {
  items?: AppEvent[];
  error?: string;
  reason?: string;
}

export interface PromoteCandidate {
  label: string;
  url: string;
  defaultRole: AssetRole;
}

interface PastAnnouncementsProps {
  appId: string;
  clanAccountId: string | null;
  brand: GameBrand;
  cache: ContextCache;
  /** Reuses the brand-promote pipeline so promoted past announcements
   *  ingest as steam-source brand assets identical to "Add from Steam". */
  onPromote: (candidate: PromoteCandidate) => Promise<void> | void;
}

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; items: AppEvent[] }
  | { status: 'empty' }
  | { status: 'unavailable'; reason: string }
  | { status: 'error'; message: string };

export function PastAnnouncements({
  appId,
  clanAccountId,
  brand,
  cache,
  onPromote,
}: PastAnnouncementsProps) {
  const [load, setLoad] = useState<LoadState>({ status: 'idle' });
  const [busyUrl, setBusyUrl] = useState<string | null>(null);

  const fetchEvents = useCallback(
    async (force = false) => {
      if (!clanAccountId) {
        setLoad({
          status: 'unavailable',
          reason: 'This Steam page does not expose the developer clan id.',
        });
        return;
      }
      setLoad({ status: 'loading' });
      try {
        if (!force) {
          const cached = await cache.get<AppEvent[]>(cacheKeys.appEvents(appId));
          if (cached) {
            setLoad(
              cached.data.length === 0
                ? { status: 'empty' }
                : { status: 'ready', items: cached.data },
            );
            return;
          }
        }
        const res: FetchAppEventsResponse = await chrome.runtime.sendMessage({
          type: 'FETCH_APP_EVENTS',
          appId,
          clanAccountId,
          count: 5,
        });
        if (!res || res.error || !res.items) {
          setLoad({
            status: 'error',
            message: res?.error ?? 'No response from background worker',
          });
          return;
        }
        await cache.set(cacheKeys.appEvents(appId), res.items, {
          source: 'fetchAppEvents',
          ttl: TTL_MS,
        });
        setLoad(
          res.items.length === 0
            ? { status: 'empty' }
            : { status: 'ready', items: res.items },
        );
      } catch (e) {
        setLoad({
          status: 'error',
          message: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [appId, clanAccountId, cache],
  );

  useEffect(() => {
    void fetchEvents(false);
  }, [fetchEvents]);

  const galleryItems = useMemo(() => {
    if (load.status !== 'ready') return [];
    return load.items.filter(
      (i): i is AppEvent & { capsuleImage: string } => !!i.capsuleImage,
    );
  }, [load]);

  const handleClick = useCallback(
    async (item: AppEvent & { capsuleImage: string }) => {
      if (findBrandAssetBySteamUrl(brand, item.capsuleImage)) return;
      setBusyUrl(item.capsuleImage);
      try {
        await onPromote({
          label: item.eventName || 'Past announcement',
          url: item.capsuleImage,
          defaultRole: 'mood',
        });
      } finally {
        setBusyUrl(null);
      }
    },
    [brand, onPromote],
  );

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-1.5">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Past Announcements
        </h4>
        <button
          type="button"
          onClick={() => void fetchEvents(true)}
          disabled={load.status === 'loading' || !clanAccountId}
          className="text-[10px] text-gray-500 hover:text-gray-300 disabled:opacity-50"
          title="Refresh"
        >
          {load.status === 'loading' ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {load.status === 'loading' && (
        <div className="text-[10px] text-gray-600 italic">
          Fetching past announcements…
        </div>
      )}

      {load.status === 'empty' && (
        <div className="text-[10px] text-gray-600 italic">
          No past announcements found for this app.
        </div>
      )}

      {load.status === 'unavailable' && (
        <div className="text-[10px] text-gray-600 italic">
          Past announcements unavailable: {load.reason}
        </div>
      )}

      {load.status === 'error' && (
        <div className="text-[10px] text-red-300 bg-red-900/30 border border-red-800 rounded p-2 break-words">
          Couldn't load past announcements: {load.message}
        </div>
      )}

      {load.status === 'ready' && galleryItems.length === 0 && (
        <div className="text-[10px] text-gray-600 italic">
          Past announcements found, but none had capsule thumbnails.
        </div>
      )}

      {galleryItems.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {galleryItems.map((item) => {
            const promoted = !!findBrandAssetBySteamUrl(brand, item.capsuleImage);
            const isBusy = busyUrl === item.capsuleImage;
            const dateLabel = item.startTime
              ? new Date(item.startTime * 1000).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : '';
            return (
              <button
                key={item.gid}
                type="button"
                onClick={() => void handleClick(item)}
                disabled={promoted || isBusy}
                title={
                  promoted
                    ? `${item.eventName} (already added)`
                    : `Add "${item.eventName}" capsule as a brand reference`
                }
                className="relative group rounded overflow-hidden border border-gray-700 hover:border-gray-500 disabled:opacity-60 disabled:cursor-not-allowed bg-gray-800/40"
              >
                <img
                  src={item.capsuleImage}
                  alt={item.eventName}
                  className="w-full aspect-video object-cover"
                  loading="lazy"
                  onError={(e) => {
                    (e.currentTarget.parentElement as HTMLElement | null)?.classList.add(
                      'opacity-30',
                    );
                  }}
                />
                <div className="absolute inset-x-0 bottom-0 px-1 py-0.5 bg-black/70 text-white">
                  <div className="text-[9px] truncate">{item.eventName}</div>
                  {dateLabel && (
                    <div className="text-[8px] text-gray-400">{dateLabel}</div>
                  )}
                </div>
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
      )}
    </div>
  );
}
