import { useEffect, useState } from 'react';
import type { GameProfile, Palette, PaletteError, Result, StoreMetadata } from '@announcekit/core';
import type { SerializedPageContext } from '../content/scraper';
import { getGameProfile, saveGameProfile } from '../storage/gameProfiles';
import { GameCard } from './components/GameCard';
import { DebugView } from './components/DebugView';

type AppState =
  | { status: 'no-steam' }
  | { status: 'loading'; appId: string }
  | { status: 'ready'; profile: GameProfile; pageContext: SerializedPageContext }
  | { status: 'error'; message: string; pageContext?: SerializedPageContext };

type ViewMode = 'main' | 'debug';

export default function App() {
  const [state, setState] = useState<AppState>({ status: 'loading', appId: '' });
  const [viewMode, setViewMode] = useState<ViewMode>('main');
  const [storeMetadata, setStoreMetadata] = useState<StoreMetadata | undefined>();

  useEffect(() => {
    async function init() {
      try {
        // Get the active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) {
          setState({ status: 'no-steam' });
          return;
        }

        // Request page context from content script
        let pageContext: SerializedPageContext;
        try {
          pageContext = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTEXT' });
        } catch {
          // Content script not injected (not on a Steam page)
          setState({ status: 'no-steam' });
          return;
        }

        if (!pageContext?.appId) {
          setState({ status: 'no-steam' });
          return;
        }

        const appId = pageContext.appId;
        setState({ status: 'loading', appId });

        // Check if we already have this game saved. Skip legacy profiles that
        // pre-date the Palette contract — they'll be rebuilt from the new flow.
        const existing = await getGameProfile(appId);
        if (existing && existing.palette?.primary) {
          setState({ status: 'ready', profile: existing, pageContext });
          return;
        }

        // Fetch from Steam API via service worker
        const details = await chrome.runtime.sendMessage({
          type: 'FETCH_GAME_DETAILS',
          appId,
        });

        if (!details || details.error) {
          setState({
            status: 'error',
            message: details?.error ?? 'Failed to fetch game details',
            pageContext,
          });
          return;
        }

        // Stash the raw store metadata for the debug view
        if (details.appId && details.fetchedAt) {
          setStoreMetadata(details as StoreMetadata);
        }

        // Extract palette via service worker. The capsule art is the most
        // reliable source — it's always present and tuned for visual identity.
        const paletteImageUrl =
          details.assets?.capsule ?? details.capsuleImage ?? details.assets?.header ?? details.headerImage ?? '';
        const paletteResult: Result<Palette, PaletteError> = await chrome.runtime.sendMessage({
          type: 'EXTRACT_PALETTE',
          imageUrl: paletteImageUrl,
        });

        if (!paletteResult?.ok) {
          setState({
            status: 'error',
            message: paletteResult?.error?.message ?? 'Palette extraction failed',
            pageContext,
          });
          return;
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

        await saveGameProfile(profile);
        setState({ status: 'ready', profile, pageContext });
      } catch (err) {
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    init();
  }, []);

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

      {/* Debug view (shown for any state that has pageContext) */}
      {viewMode === 'debug' && pageContext && (
        <DebugView
          context={pageContext}
          profile={state.status === 'ready' ? state.profile : undefined}
          storeMetadata={storeMetadata}
        />
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
                <div className="mb-4 bg-blue-900/30 border border-blue-800 rounded-lg p-3">
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

              <GameCard profile={state.profile} />
            </>
          )}
        </>
      )}
    </div>
  );
}
