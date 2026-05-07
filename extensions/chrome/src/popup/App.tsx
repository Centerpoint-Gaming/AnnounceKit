import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  EditedThumbnail,
  EditReference,
  GameProfile,
  Palette,
  PaletteError,
  Result,
  StoreMetadata,
  CacheEntry,
  ThumbnailEditError,
} from '@announcekit/core';
import { assembleGameProfile, cacheKeys } from '@announcekit/core';
import type { SerializedPageContext } from '../content/scraper';
import { getGameProfile, saveGameProfile, invalidateGameProfile } from '../storage/gameProfiles';
import { buildContextCache } from '../storage/contextCache';
import { createIndexedDBBinaryStore } from '../storage/binaryStore';
import { createIndexedDBThumbnailCache } from '../storage/thumbnailCache';
import { GameCard } from './components/GameCard';
import { DebugView } from './components/DebugView';
import { GameSummary } from './components/GameSummary';
import { ActionBar, type ThumbnailState, type GenerateThumbnailResult } from './components/ActionBar';
import { ThumbnailEditor, type ChainNode, type EditingState } from './components/ThumbnailEditor';
import { BrandAssets } from './components/BrandAssets';
import { BrandAssetsCard } from './components/BrandAssetsCard';
import { ReferenceImages } from './components/ReferenceImages';
import { ReferenceImagesCard } from './components/ReferenceImagesCard';
import { BrandColors } from './components/BrandColors';
import { PastAnnouncements } from './components/PastAnnouncements';
import { PromptView } from './components/PromptView';
import { TextOverlay } from './components/TextOverlay';
import { ThumbnailHistory } from './components/ThumbnailHistory';
import { useBrandPromote } from './useBrandPromote';

type AppState =
  | { status: 'no-steam' }
  | { status: 'loading'; appId: string }
  | { status: 'ready'; profile: GameProfile; pageContext: SerializedPageContext; cachedAt: number; source: string }
  | { status: 'error'; message: string; pageContext?: SerializedPageContext };

type ViewMode = 'main' | 'details' | 'debug' | 'prompt' | 'brand' | 'references' | 'text-overlay';

export default function App() {
  // Construct the cache once per popup mount and thread it down — no singleton.
  const cache = useMemo(() => buildContextCache(), []);
  const binaryStore = useMemo(() => createIndexedDBBinaryStore(), []);
  const thumbnailCache = useMemo(() => createIndexedDBThumbnailCache(), []);

  const [state, setState] = useState<AppState>({ status: 'loading', appId: '' });
  const [viewMode, setViewMode] = useState<ViewMode>('main');
  const [storeMetadata, setStoreMetadata] = useState<StoreMetadata | undefined>();
  const [refreshing, setRefreshing] = useState(false);
  const [cacheEntry, setCacheEntry] = useState<CacheEntry<GameProfile> | undefined>();
  const [thumbnailState, setThumbnailState] = useState<ThumbnailState>({ status: 'idle' });
  const [historyVersion, setHistoryVersion] = useState(0);
  const [userPrompt, setUserPrompt] = useState('');
  // In-session edit chain. Each compounding edit appends a node; currentIndex
  // points at the displayed image (also the priorImage for the next edit).
  // Cross-session persistence is handled by ThumbnailHistory + thumbnail cache.
  const [editChain, setEditChain] = useState<ChainNode[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editingState, setEditingState] = useState<EditingState>({ status: 'idle' });

  const readyProfile = state.status === 'ready' ? state.profile : null;
  const readyPageContext = state.status === 'ready' ? state.pageContext : null;
  const clanAccountId =
    readyPageContext?.communityConfig?.clanAccountId ?? null;

  const { promote: promoteFromSteam } = useBrandPromote({
    profile: readyProfile,
    cache,
    binaryStore,
    onProfileChange: (next) => {
      if (state.status !== 'ready') return;
      setState({
        status: 'ready',
        profile: next,
        pageContext: state.pageContext,
        cachedAt: Date.now(),
        source: 'brand-promote',
      });
    },
  });

  // ── Fetch fresh data from Steam API + palette extraction ────────────────

  const fetchFresh = useCallback(async (appId: string, pageContext: SerializedPageContext) => {
    const details = (await chrome.runtime.sendMessage({
      type: 'FETCH_GAME_DETAILS',
      appId,
    })) as StoreMetadata | { error: string; reason?: string } | null;

    if (!details || 'error' in details) {
      throw new Error(
        details && 'error' in details ? details.error : 'Failed to fetch game details',
      );
    }

    setStoreMetadata(details);
    await cache.set(cacheKeys.storeMetadata(appId), details, {
      source: 'fetchStoreMetadata',
    });

    const paletteImageUrl = details.assets.capsule || details.assets.header || '';
    const paletteResult: Result<Palette, PaletteError> = await chrome.runtime.sendMessage({
      type: 'EXTRACT_PALETTE',
      imageUrl: paletteImageUrl,
    });

    if (!paletteResult?.ok) {
      throw new Error(paletteResult?.error?.message ?? 'Palette extraction failed');
    }

    const profile = assembleGameProfile({
      appId,
      metadata: details,
      palette: paletteResult.data,
    });

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

  // ── Generate thumbnail handler ─────────────────────────────────────────

  const handleGenerateThumbnail = useCallback(async () => {
    if (state.status !== 'ready') return;
    if (thumbnailState.status === 'generating') return;

    setThumbnailState({ status: 'generating' });
    try {
      const trimmedUserPrompt = userPrompt.trim();
      const result: GenerateThumbnailResult = await chrome.runtime.sendMessage({
        type: 'GENERATE_THUMBNAIL',
        profile: state.profile,
        announcementId: state.pageContext.eventGid ?? null,
        announcementTitle: state.pageContext.editorState.existingTitle,
        announcementBody: state.pageContext.editorState.existingBody,
        userPrompt: trimmedUserPrompt || undefined,
      });

      if (!result?.ok) {
        setThumbnailState({
          status: 'error',
          error: result?.error ?? {
            reason: 'invalid-response',
            message: 'No response from background worker',
          },
        });
        return;
      }

      setThumbnailState({ status: 'ready', thumbnail: result.data });
      // Reset the edit chain to the freshly generated image.
      setEditChain([
        {
          dataUrl: result.data.dataUrl,
          mimeType: result.data.mimeType,
          model: result.data.model,
          generatedAt: result.data.generatedAt,
          instruction: null,
        },
      ]);
      setCurrentIndex(0);
      setEditingState({ status: 'idle' });
      setHistoryVersion((v) => v + 1);
    } catch (err) {
      setThumbnailState({
        status: 'error',
        error: {
          reason: 'network',
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }, [state, thumbnailState.status, userPrompt]);

  // ── Edit handlers ──────────────────────────────────────────────────────

  const handleApplyEdit = useCallback(
    async (instruction: string, references: readonly EditReference[]) => {
      if (state.status !== 'ready') return;
      if (editingState.status === 'applying') return;
      const current = editChain[currentIndex];
      if (!current) return;

      setEditingState({ status: 'applying' });
      try {
        const result: Result<EditedThumbnail, ThumbnailEditError> =
          await chrome.runtime.sendMessage({
            type: 'EDIT_THUMBNAIL',
            profile: state.profile,
            announcementId: state.pageContext.eventGid ?? null,
            priorImageDataUrl: current.dataUrl,
            instruction,
            references,
            announcementTitle: state.pageContext.editorState.existingTitle,
          });

        if (!result?.ok) {
          setEditingState({
            status: 'error',
            error: result?.error ?? {
              reason: 'invalid-response',
              message: 'No response from background worker',
            },
          });
          return;
        }

        const newNode: ChainNode = {
          dataUrl: result.data.dataUrl,
          mimeType: result.data.mimeType,
          model: result.data.model,
          generatedAt: result.data.generatedAt,
          instruction: result.data.instructionUsed,
        };
        // Append after the currently displayed node — branches off the chain
        // if the user navigated back. Discards anything after currentIndex,
        // chatbot-style: editing from an old version creates a new fork.
        setEditChain((prev) => [...prev.slice(0, currentIndex + 1), newNode]);
        setCurrentIndex(currentIndex + 1);
        setThumbnailState({
          status: 'ready',
          thumbnail: {
            dataUrl: newNode.dataUrl,
            mimeType: newNode.mimeType,
            promptUsed: result.data.promptUsed,
            model: newNode.model,
            generatedAt: newNode.generatedAt,
          },
        });
        setEditingState({ status: 'idle' });
        setHistoryVersion((v) => v + 1);
      } catch (err) {
        setEditingState({
          status: 'error',
          error: {
            reason: 'network',
            message: err instanceof Error ? err.message : String(err),
          },
        });
      }
    },
    [state, editChain, currentIndex, editingState.status],
  );

  const handlePickVersion = useCallback(
    (idx: number) => {
      const node = editChain[idx];
      if (!node) return;
      setCurrentIndex(idx);
      setEditingState({ status: 'idle' });
      setThumbnailState({
        status: 'ready',
        thumbnail: {
          dataUrl: node.dataUrl,
          mimeType: node.mimeType,
          promptUsed: '',
          model: node.model,
          generatedAt: node.generatedAt,
        },
      });
    },
    [editChain],
  );

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
              {state.status === 'ready' && (
                <button
                  onClick={() => setViewMode('prompt')}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    viewMode === 'prompt'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  Prompt
                </button>
              )}
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

      {/* Prompt view */}
      {viewMode === 'prompt' && state.status === 'ready' && (
        <PromptView
          profile={state.profile}
          pageContext={state.pageContext}
          userPrompt={userPrompt.trim() || undefined}
        />
      )}

      {/* Reference images view */}
      {viewMode === 'references' && state.status === 'ready' && (
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
          <ReferenceImages
            profile={state.profile}
            cache={cache}
            binaryStore={binaryStore}
            onProfileChange={(next) =>
              setState({
                status: 'ready',
                profile: next,
                pageContext: state.pageContext,
                cachedAt: Date.now(),
                source: 'reference-images',
              })
            }
          />
        </div>
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

      {/* Brand assets view — full CRUD controls */}
      {viewMode === 'brand' && state.status === 'ready' && (
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
          <BrandColors
            profile={state.profile}
            cache={cache}
            onProfileChange={(next) =>
              setState({
                status: 'ready',
                profile: next,
                pageContext: state.pageContext,
                cachedAt: Date.now(),
                source: 'brand-colors',
              })
            }
          />
          <BrandAssets
            profile={state.profile}
            cache={cache}
            binaryStore={binaryStore}
            clanAccountId={clanAccountId}
            onProfileChange={(next) =>
              setState({
                status: 'ready',
                profile: next,
                pageContext: state.pageContext,
                cachedAt: Date.now(),
                source: 'brand-assets',
              })
            }
          />
        </div>
      )}

      {/* Text overlay view */}
      {viewMode === 'text-overlay' && state.status === 'ready' && thumbnailState.status === 'ready' && (
        <TextOverlay
          imageDataUrl={thumbnailState.thumbnail.dataUrl}
          gameName={state.profile.name}
          announcementTitle={state.pageContext.editorState.existingTitle}
          announcementBody={state.pageContext.editorState.existingBody}
          profile={state.profile}
          onBack={() => setViewMode('main')}
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

              {/* Brand assets summary — opens full controls in their own view */}
              <BrandAssetsCard
                brand={state.profile.brand}
                onView={() => setViewMode('brand')}
              />

              {/* Reference images summary — approved layouts to match */}
              <ReferenceImagesCard
                brand={state.profile.brand}
                onView={() => setViewMode('references')}
              />

              {/* Primary CTA */}
              <ActionBar
                isEditor={!!pageContext?.isAnnouncementEditor}
                announcementTitle={pageContext?.editorState.existingTitle}
                thumbnailState={thumbnailState}
                userPrompt={userPrompt}
                onUserPromptChange={setUserPrompt}
                onGenerate={handleGenerateThumbnail}
                onNext={
                  thumbnailState.status === 'ready'
                    ? () => setViewMode('text-overlay')
                    : undefined
                }
              />

              {/* Iterative refinement: edit the current thumbnail, navigate the chain. */}
              {editChain.length > 0 && thumbnailState.status === 'ready' && (
                <ThumbnailEditor
                  chain={editChain}
                  currentIndex={currentIndex}
                  editingState={editingState}
                  onApply={handleApplyEdit}
                  onPickVersion={handlePickVersion}
                />
              )}

              <ThumbnailHistory
                cache={thumbnailCache}
                binaryStore={binaryStore}
                appId={state.profile.appId}
                announcementId={state.pageContext.eventGid ?? null}
                refreshKey={historyVersion}
                onSelect={(thumbnail) =>
                  setThumbnailState({ status: 'ready', thumbnail })
                }
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
