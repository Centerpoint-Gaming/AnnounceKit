import {
  fetchAppEvents,
  fetchStoreMetadata,
  generateThumbnail,
  editThumbnail,
  generateOverlays,
  buildPromptFromContext,
  buildOverlayPrompt,
  assembleBrandGuidelines,
  err,
  ok,
} from '@announcekit/core';
import type {
  EditReference,
  GameProfile,
  OverlayPromptContext,
  Result,
  StoredAsset,
  ThumbnailReference,
} from '@announcekit/core';
import { createIndexedDBBinaryStore } from '../storage/binaryStore.js';
import { createIndexedDBThumbnailCache } from '../storage/thumbnailCache.js';
import { extractPalette } from './palette.js';
import { buildPromptContextFromProfile } from '../buildPromptContext.js';
import {
  selectBrandAssets,
  selectReferenceImages,
} from '../selectReferences.js';

const binaryStore = createIndexedDBBinaryStore();
const thumbnailCache = createIndexedDBThumbnailCache();

export type FetchAssetBytesErrorReason =
  | 'invalid-url'
  | 'fetch-failed'
  | 'network'
  | 'too-large';

export interface FetchAssetBytesError {
  reason: FetchAssetBytesErrorReason;
  message: string;
  status?: number;
}

export interface FetchAssetBytesResult {
  bytesBase64: string;
  mimeType: string;
  byteCount: number;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_GAME_DETAILS') {
    handleFetchGameDetails(message.appId).then(sendResponse);
    return true;
  }

  if (message.type === 'EXTRACT_PALETTE') {
    extractPalette(message.imageUrl).then(sendResponse);
    return true;
  }

  if (message.type === 'GENERATE_THUMBNAIL') {
    handleGenerateThumbnail(
      message.profile,
      message.announcementId ?? null,
      message.announcementTitle,
      message.announcementBody,
      message.userPrompt,
    ).then(sendResponse);
    return true;
  }

  if (message.type === 'EDIT_THUMBNAIL') {
    handleEditThumbnail({
      profile: message.profile,
      announcementId: message.announcementId ?? null,
      priorImageDataUrl: message.priorImageDataUrl,
      instruction: message.instruction,
      references: message.references,
      announcementTitle: message.announcementTitle,
    }).then(sendResponse);
    return true;
  }

  if (message.type === 'GENERATE_OVERLAYS') {
    handleGenerateOverlays(
      message.profile,
      message.thumbnailDataUrl,
      message.announcementTitle,
      message.announcementBody,
      message.userPrompt,
      message.fontFamily,
    ).then(sendResponse);
    return true;
  }

  if (message.type === 'FETCH_ASSET_BYTES') {
    handleFetchAssetBytes(message.url).then(sendResponse);
    return true;
  }

  if (message.type === 'FETCH_APP_EVENTS') {
    handleFetchAppEvents(
      message.appId,
      message.clanAccountId,
      message.count,
    ).then(sendResponse);
    return true;
  }

  if (message.type === 'PAGE_CONTEXT_READY') {
    // Update badge when content script detects a Steam page
    const ctx = message.context;
    const tabId = sender.tab?.id;
    if (tabId) {
      if (ctx?.isAnnouncementEditor) {
        chrome.action.setBadgeText({ text: 'Edit', tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#3b82f6', tabId });
      } else if (ctx?.appId) {
        chrome.action.setBadgeText({ text: 'OK', tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#22c55e', tabId });
      }
    }
    return false;
  }
});

async function handleGenerateThumbnail(
  profile: GameProfile,
  announcementId: string | null,
  announcementTitle?: string,
  announcementBody?: string,
  userPrompt?: string,
) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY ?? '';
  const model = import.meta.env.VITE_GEMINI_IMAGE_MODEL;

  const ctx = buildPromptContextFromProfile(profile, {
    announcementTitle,
    announcementBody,
    userPrompt,
  });
  const prompt = buildPromptFromContext(ctx);
  const { selected: selectedBrand } = selectBrandAssets(profile.brand);
  const { selected: selectedRefs } = selectReferenceImages(profile.brand);
  // Attachment order MUST match prompt section order — brand assets first,
  // then reference images — so the model can correlate "brand asset N" /
  // "reference N" in the per-image notes with the right inline image.
  const ordered = [...selectedBrand, ...selectedRefs];
  const references = await resolveReferences(ordered);

  logRequestSummary(prompt, ordered, references);

  const result = await generateThumbnail({
    apiKey,
    prompt,
    references,
    model,
  });

  if (result.ok) {
    await persistThumbnail({
      result: result.data,
      profile,
      announcementId,
      announcementTitle,
      userPrompt,
      referenceAssets: ordered,
    });
  }

  return result;
}

async function handleEditThumbnail(args: {
  profile: GameProfile;
  announcementId: string | null;
  priorImageDataUrl: string;
  instruction: string;
  references?: readonly EditReference[];
  announcementTitle?: string;
}) {
  const {
    profile,
    announcementId,
    priorImageDataUrl,
    instruction,
    references,
    announcementTitle,
  } = args;
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY ?? '';
  const model = import.meta.env.VITE_GEMINI_IMAGE_MODEL;

  const decoded = decodeDataUrl(priorImageDataUrl);
  if (!decoded) {
    return err({
      reason: 'missing-prior-image' as const,
      message: 'Could not decode priorImage data URL',
    });
  }
  const priorBase64 = bytesToBase64(decoded.bytes);

  // eslint-disable-next-line no-console
  console.log('[editThumbnail] request', {
    instructionChars: instruction.length,
    priorBase64Bytes: priorBase64.length,
    references: (references ?? []).map((r) => ({
      role: r.role,
      mimeType: r.mimeType,
      hasNote: !!r.note,
    })),
  });

  const result = await editThumbnail({
    apiKey,
    instruction,
    priorImage: { mimeType: decoded.mimeType, data: priorBase64 },
    references,
    model,
  });

  if (result.ok) {
    const dec = decodeDataUrl(result.data.dataUrl);
    if (dec) {
      const put = await binaryStore.put(dec.bytes, dec.mimeType);
      if (put.ok) {
        const cacheRes = await thumbnailCache.put({
          appId: profile.appId,
          announcementId,
          binaryRef: put.data.binaryRef,
          mimeType: put.data.mimeType,
          byteCount: put.data.byteCount,
          prompt: result.data.promptUsed,
          userPrompt: instruction.trim() || null,
          model: result.data.model,
          referenceBinaryRefs: [],
          announcementTitle: announcementTitle ?? null,
          generatedAt: result.data.generatedAt,
        });
        if (!cacheRes.ok) {
          console.warn('[editThumbnail] cache put failed:', cacheRes.error.message);
        }
      } else {
        console.warn('[editThumbnail] binary store put failed:', put.error.message);
      }
    }
  }

  return result;
}

async function handleGenerateOverlays(
  profile: GameProfile,
  thumbnailDataUrl: string,
  announcementTitle?: string,
  announcementBody?: string,
  userPrompt?: string,
  fontFamily?: string,
) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY ?? '';
  const model = import.meta.env.VITE_GEMINI_OVERLAY_MODEL;

  const decoded = decodeDataUrl(thumbnailDataUrl);
  if (!decoded) {
    return err({
      reason: 'invalid-response' as const,
      message: 'Could not decode thumbnail data URL',
    });
  }

  const thumbnailBase64 = bytesToBase64(decoded.bytes);
  const brand = assembleBrandGuidelines(profile.palette, profile.brand.colors, fontFamily);

  const blob = new Blob([decoded.bytes as BlobPart], { type: decoded.mimeType });
  let dims: { width: number; height: number };
  try {
    const bitmap = await createImageBitmap(blob);
    dims = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
  } catch {
    dims = { width: 1024, height: 1024 };
  }

  const ctx: OverlayPromptContext = {
    gameName: profile.name,
    announcementTitle,
    announcementBody,
    userPrompt,
    brand,
    dimensions: dims,
    variantCount: 4,
  };

  const prompt = buildOverlayPrompt(ctx);

  // eslint-disable-next-line no-console
  console.log('[generateOverlays] request', {
    promptChars: prompt.length,
    imageSize: `${dims.width}x${dims.height}`,
    base64Bytes: thumbnailBase64.length,
  });

  return generateOverlays({
    apiKey,
    prompt,
    thumbnailBase64,
    thumbnailMimeType: decoded.mimeType,
    model,
  });
}

async function persistThumbnail(args: {
  result: { dataUrl: string; mimeType: string; promptUsed: string; model: string; generatedAt: number };
  profile: GameProfile;
  announcementId: string | null;
  announcementTitle?: string;
  userPrompt?: string;
  referenceAssets: readonly StoredAsset[];
}) {
  const { result, profile, announcementId, announcementTitle, userPrompt, referenceAssets } = args;
  const decoded = decodeDataUrl(result.dataUrl);
  if (!decoded) {
    console.warn('[persistThumbnail] failed to decode dataUrl, skipping cache write');
    return;
  }
  const put = await binaryStore.put(decoded.bytes, decoded.mimeType);
  if (!put.ok) {
    console.warn('[persistThumbnail] binary store put failed:', put.error.message);
    return;
  }
  const cacheRes = await thumbnailCache.put({
    appId: profile.appId,
    announcementId,
    binaryRef: put.data.binaryRef,
    mimeType: put.data.mimeType,
    byteCount: put.data.byteCount,
    prompt: result.promptUsed,
    userPrompt: userPrompt?.trim() ? userPrompt.trim() : null,
    model: result.model,
    referenceBinaryRefs: referenceAssets.map((a) => a.binaryRef),
    announcementTitle: announcementTitle ?? null,
    generatedAt: result.generatedAt,
  });
  if (!cacheRes.ok) {
    console.warn('[persistThumbnail] cache put failed:', cacheRes.error.message);
  }
}

function decodeDataUrl(
  dataUrl: string,
): { bytes: Uint8Array; mimeType: string } | null {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/i.exec(dataUrl);
  if (!match) return null;
  const mimeType = match[1] || 'image/png';
  const isBase64 = !!match[2];
  const payload = match[3];
  try {
    if (isBase64) {
      const binary = atob(payload);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return { bytes, mimeType };
    }
    const decoded = decodeURIComponent(payload);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
    return { bytes, mimeType };
  } catch {
    return null;
  }
}

async function resolveReferences(
  assets: readonly StoredAsset[],
): Promise<ThumbnailReference[]> {
  const references: ThumbnailReference[] = [];
  for (const asset of assets) {
    const got = await binaryStore.get(asset.binaryRef);
    if (!got.ok) continue;
    references.push({
      data: bytesToBase64(got.data.bytes),
      mimeType: got.data.mimeType,
    });
  }
  return references;
}

function logRequestSummary(
  prompt: string,
  selected: readonly StoredAsset[],
  resolved: readonly ThumbnailReference[],
) {
  const totalBase64Bytes = resolved.reduce((sum, r) => sum + r.data.length, 0);
  // Inline base64 inflates by ~4/3, so wire size ≈ totalBase64Bytes.
  const summary = selected.map((a, i) => ({
    name: a.name,
    role: a.role ?? 'other',
    mimeType: a.mimeType,
    sourceBytes: a.bytes,
    resolved: !!resolved[i],
  }));
  // eslint-disable-next-line no-console
  console.log('[generateThumbnail] request', {
    promptChars: prompt.length,
    referencesSelected: selected.length,
    referencesResolved: resolved.length,
    payloadBase64Bytes: totalBase64Bytes,
    references: summary,
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function handleFetchAssetBytes(
  url: string,
): Promise<Result<FetchAssetBytesResult, FetchAssetBytesError>> {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return err({ reason: 'invalid-url', message: `Not a fetchable URL: ${url}` });
  }
  let response: Response;
  try {
    response = await fetch(url);
  } catch (e) {
    return err({
      reason: 'network',
      message: e instanceof Error ? e.message : String(e),
    });
  }
  if (!response.ok) {
    return err({
      reason: 'fetch-failed',
      status: response.status,
      message: `HTTP ${response.status} fetching ${url}`,
    });
  }
  const buf = new Uint8Array(await response.arrayBuffer());
  const mimeType =
    response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';

  // Chunked base64 encode — String.fromCharCode chokes on >100k argument lists.
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < buf.length; i += chunkSize) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunkSize));
  }
  return ok({
    bytesBase64: btoa(binary),
    mimeType,
    byteCount: buf.length,
  });
}

async function handleFetchGameDetails(appId: string) {
  const result = await fetchStoreMetadata(appId);

  if (!result.ok) {
    return { error: result.error.message, reason: result.error.reason };
  }

  return result.data;
}

async function handleFetchAppEvents(
  appId: string,
  clanAccountId: string,
  count?: number,
) {
  const result = await fetchAppEvents({ appId, clanAccountId, count });
  if (!result.ok) {
    return { error: result.error.message, reason: result.error.reason };
  }
  return { items: result.data };
}
