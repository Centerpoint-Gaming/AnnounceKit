import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GameProfile, Palette, PaletteError, Result, StoreMetadata, CacheEntry } from '@announcekit/core';
import { cacheKeys } from '@announcekit/core';
import type { SerializedPageContext } from '../content/scraper';
import { getGameProfile, saveGameProfile, invalidateGameProfile } from '../storage/gameProfiles';
import { buildContextCache } from '../storage/contextCache';
import { GameCard } from './components/GameCard';
import { DebugView } from './components/DebugView';
import { GameSummary } from './components/GameSummary';
import { ActionBar } from './components/ActionBar';

type AppState =
  | { status: 'no-steam' }
  | { status: 'loading'; appId: string }
  | { status: 'ready'; profile: GameProfile; pageContext: SerializedPageContext; cachedAt: number; source: string }
  | { status: 'error'; message: string; pageContext?: SerializedPageContext };

type ViewMode = 'main' | 'details' | 'debug';

export default function App() {
  // Construct the cache once per popup mount and thread it down — no singleton.
  const cache = useMemo(() => buildContextCache(), []);

  const [state, setState] = useState<AppState>({ status: 'loading', appId: '' });
  const [viewMode, setViewMode] = useState<ViewMode>('main');
  const [storeMetadata, setStoreMetadata] = useState<StoreMetadata | undefined>();
  const [refreshing, setRefreshing] = useState(false);
  const [cacheEntry, setCacheEntry] = useState<CacheEntry<GameProfile> | undefined>();

  // ── Fetch fresh data from Steam API + palette extraction ────────────────

  const fetchFresh = useCallback(async (appId: string, pageContext: SerializedPageContext) => {
    const details = await chrome.runtime.sendMessage({
      type: 'FETCH_GAME_DETAILS',
      appId,
    });

    if (!details || details.error) {
      throw new Error(details?.error ?? 'Failed to fetch game details');
    }

    if (details.appId && details.fetchedAt) {
      setStoreMetadata(details as StoreMetadata);
      await cache.set(cacheKeys.storeMetadata(appId), details, {
        source: 'fetchStoreMetadata',
      });
    }

    const paletteImageUrl =
      details.assets?.capsule ?? details.capsuleImage ?? details.assets?.header ?? details.headerImage ?? '';
    const paletteResult: Result<Palette, PaletteError> = await chrome.runtime.sendMessage({
      type: 'EXTRACT_PALETTE',
      imageUrl: paletteImageUrl,
    });

    if (!paletteResult?.ok) {
      throw new Error(paletteResult?.error?.message ?? 'Palette extraction failed');
    }

    const profile: GameProfile = {
      appId,
      name: details.name,
      shortDescription: details.shortDescription,
      tags: [
        ...(details.tags ?? []),
        ...(details.genres ?? []),
        ...(details.categories ?? []),
      ],
      storeAssets: {
        headerCapsule: details.assets?.header ?? details.headerImage ?? '',
        heroImage: details.assets?.background ?? details.background ?? null,
        screenshots: details.assets?.screenshots ?? details.screenshots?.map((s: { pathFull: string }) => s.pathFull) ?? [],
        logo: details.assets?.capsule ?? details.capsuleImage ?? null,
      },
      palette: paletteResult.data,
      brand: {
        logos: [],
        colors: [],
        exampleThumbnails: [],
      },
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    };

    await saveGameProfile(cache, profile);

    const entry = await getGameProfile(cache, appId);
    if (entry) {
      setCacheEntry(entry);
    }

    setState({
      status: 'ready',
      profile,
      pageContext,
      cachedAt: Date.now(),
      source: 'fetchStoreMetadata',
    });
  }, [cache]);

  // ── Initial load ───────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) {
          setState({ status: 'no-steam' });
          return;
        }

        let pageContext: SerializedPageContext;
        try {
          pageContext = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTEXT' });
        } catch {
          setState({ status: 'no-steam' });
          return;
        }

        if (!pageContext?.appId) {
          setState({ status: 'no-steam' });
          return;
        }

        const appId = pageContext.appId;
        setState({ status: 'loading', appId });

        const cachedMeta = await cache.get<StoreMetadata>(cacheKeys.storeMetadata(appId));
        if (cachedMeta) {
          setStoreMetadata(cachedMeta.data);
        }

        const entry = await getGameProfile(cache, appId);
        if (entry && entry.data.palette?.primary) {
          setCacheEntry(entry);
          setState({
            status: 'ready',
            profile: entry.data,
            pageContext,
            cachedAt: entry.cachedAt,
            source: entry.source,
          });
          return;
        }

        await fetchFresh(appId, pageContext);
      } catch (err) {
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    init();
  }, [cache, fetchFresh]);

  // ── Refresh handler ────────────────────────────────────────────────────

  const handleRefresh = useCallback(async () => {
    if (state.status !== 'ready' || refreshing) return;

    setRefreshing(true);
    try {
      const appId = state.profile.appId;
      await invalidateGameProfile(cache, appId);

      await cache.invalidate(cacheKeys.storeMetadata(appId));

      await fetchFresh(appId, state.pageContext);
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Refresh failed',
        pageContext: state.pageContext,
      });
    } finally {
      setRefreshing(false);
    }
  }, [cache, state, refreshing, fetchFresh]);

  // ── Derived values ─────────────────────────────────────────────────────

  const pageContext =
    state.status === 'ready'
      ? state.pageContext
      : state.status === 'error'
        ? state.pageContext
        : undefined;

  return (
    <div className="p-4 bg-gray-900 text-white min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold">AnnounceKit</h1>
        <div className="flex items-center gap-1">
          {pageContext && (
            <>
              <button
                onClick={() => setViewMode('main')}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  viewMode === 'main'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                Main
              </button>
              <button
                onClick={() => setViewMode('debug')}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  viewMode === 'debug'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                Debug
              </button>
            </>
          )}
        </div>
      </div>

      {/* Debug view */}
      {viewMode === 'debug' && pageContext && (
        <DebugView
          context={pageContext}
          profile={state.status === 'ready' ? state.profile : undefined}
          storeMetadata={storeMetadata}
          cacheEntry={cacheEntry}
        />
      )}

      {/* Details view — full GameCard */}
      {viewMode === 'details' && state.status === 'ready' && (
        <div>
          <button
            onClick={() => setViewMode('main')}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-white transition-colors mb-3"
          >
            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 2L4 6l4 4" />
            </svg>
            Back
          </button>
          <GameCard profile={state.profile} />
        </div>
      )}

      {/* Main view */}
      {viewMode === 'main' && (
        <>
          {state.status === 'no-steam' && (
            <div className="text-center text-gray-400 mt-12">
              <p className="text-4xl mb-3">&#x1F3AE;</p>
              <p className="text-sm">Navigate to a Steam page to get started.</p>
              <p className="text-xs text-gray-600 mt-2">
                Supported: Store pages, Partner events editor
              </p>
            </div>
          )}

          {state.status === 'loading' && (
            <div className="text-center text-gray-400 mt-12">
              <div className="inline-block w-6 h-6 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin mb-3" />
              <p className="text-sm">
                Loading game details{state.appId ? ` for App ${state.appId}` : ''}...
              </p>
            </div>
          )}

          {state.status === 'error' && (
            <div className="text-center text-red-400 mt-12">
              <p className="text-sm">Error: {state.message}</p>
              {pageContext && (
                <button
                  onClick={() => setViewMode('debug')}
                  className="text-xs text-gray-500 mt-2 underline hover:text-gray-300"
                >
                  View debug info
                </button>
              )}
            </div>
          )}

          {state.status === 'ready' && (
            <>
              {/* Editor context banner */}
              {pageContext?.isAnnouncementEditor && (
                <div className="mb-3 bg-blue-900/30 border border-blue-800 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                    <span className="text-xs font-semibold text-blue-300 uppercase tracking-wide">
                      Announcement Editor
                    </span>
                  </div>
                  {pageContext.editorState.existingTitle && (
                    <p className="text-sm text-white font-medium">
                      {pageContext.editorState.existingTitle}
                    </p>
                  )}
                  {pageContext.event?.jsonData?.localizedSubtitle?.[0] && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {pageContext.event.jsonData.localizedSubtitle[0]}
                    </p>
                  )}
                </div>
              )}

              {/* Game summary card */}
              <GameSummary
                profile={state.profile}
                cachedAt={state.cachedAt}
                source={state.source}
                refreshing={refreshing}
                onRefresh={handleRefresh}
                onViewDetails={() => setViewMode('details')}
              />

              {/* Primary CTA */}
              <ActionBar
                isEditor={!!pageContext?.isAnnouncementEditor}
                announcementTitle={pageContext?.editorState.existingTitle}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
