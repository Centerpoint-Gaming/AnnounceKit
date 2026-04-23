/**
 * Content script that detects Steam page context.
 *
 * Runs on Steam store, partner, and community pages.
 * detectPageContext() is the primary entry point — it reads the DOM once,
 * parses structured data from #application_config, and returns a PageContext.
 *
 * Every field degrades to null or empty string rather than throwing,
 * so Steam DOM changes won't break the extension.
 */

import {
  parseCommunityConfig,
  parsePartnerEventStore,
  extractEventGidFromUrl,
  extractAppIdFromUrl,
  detectPageVariant,
  findEventByGid,
} from '@announcekit/core';
import type {
  PageContextData,
  SteamCommunityConfig,
  SteamEventData,
} from '@announcekit/core';

// ─── PageContext type (extends core's PageContextData with DOM references) ───

export type PageContext = {
  isAnnouncementEditor: boolean;
  appId: string | null;
  editorState: {
    titleField: HTMLElement | null;
    subtitleField: HTMLElement | null;
    bodyField: HTMLElement | null;
    existingTitle: string;
    existingSubtitle: string;
    existingBody: string;
  };
  pageVariant: 'partner-announcement' | 'community-hub' | 'unknown';
  detectedAt: number;
};

// Serializable version sent over chrome.runtime.sendMessage (no HTMLElement)
export type SerializedPageContext = {
  isAnnouncementEditor: boolean;
  appId: string | null;
  editorState: {
    hasTitleField: boolean;
    hasSubtitleField: boolean;
    hasBodyField: boolean;
    existingTitle: string;
    existingSubtitle: string;
    existingBody: string;
  };
  pageVariant: 'partner-announcement' | 'community-hub' | 'unknown';
  detectedAt: number;
  // Extended data from structured config
  eventGid: string | null;
  event: SteamEventData | null;
  communityConfig: SteamCommunityConfig | null;
};

// ─── DOM reading helpers (each one is safe — returns null on failure) ─────────

function readConfigAttribute(attr: string): string | null {
  try {
    const el = document.getElementById('application_config');
    if (!el) return null;
    return el.getAttribute(attr);
  } catch {
    return null;
  }
}

/*
 * ─── Editor field detection strategy ─────────────────────────────────────────
 *
 * Steam sanitizes and obfuscates CSS class names in their partner event editor
 * (e.g. hashed/minified class names that change between deploys), so we CANNOT
 * reliably match editor fields by class name.
 *
 * Instead, we match by placeholder text on input/textarea elements. This is
 * more stable across deploys since placeholder strings are user-facing copy
 * that changes less frequently than internal class names.
 *
 * ⚠️  LOCALIZATION WARNING: These placeholder strings are English-only.
 *     If Steam localizes their editor UI (i.e. the placeholder text changes
 *     based on the user's Steam language setting), these selectors will fail
 *     for non-English users. The function degrades gracefully to null in that
 *     case, and we fall back to structured data from data-partnereventstore.
 *     If we need to support localized editors, we'll need to maintain a map
 *     of placeholder strings per language or find a more stable selector.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Find an input or textarea by its placeholder text.
 * Returns null if not found — never throws.
 */
function findFieldByPlaceholder(placeholder: string): HTMLElement | null {
  try {
    // Try exact match on input elements
    const input = document.querySelector<HTMLElement>(
      `input[placeholder="${CSS.escape(placeholder)}"]`
    );
    if (input) return input;

    // Try exact match on textarea elements
    const textarea = document.querySelector<HTMLElement>(
      `textarea[placeholder="${CSS.escape(placeholder)}"]`
    );
    if (textarea) return textarea;

    return null;
  } catch {
    return null;
  }
}

function findTitleField(): HTMLElement | null {
  return findFieldByPlaceholder('Enter Event Name here');
}

function findSubtitleField(): HTMLElement | null {
  return findFieldByPlaceholder('Enter Event Subtitle (Optional)');
}

function findBodyField(): HTMLElement | null {
  return findFieldByPlaceholder('Enter Event Description here');
}

function getFieldText(el: HTMLElement | null): string {
  if (!el) return '';
  try {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      return el.value ?? '';
    }
    return el.textContent ?? '';
  } catch {
    return '';
  }
}

// ─── Main detection function ─────────────────────────────────────────────────

/**
 * Detect the full page context from the current Steam page.
 *
 * This function is:
 * - Cheap: reads DOM once, no network calls
 * - Side-effect-free: only reads, never writes
 * - Defensive: every field degrades to null/empty rather than throwing
 *
 * Designed to run on every page load.
 */
export async function detectPageContext(): Promise<PageContext> {
  const url = window.location.href;
  const detectedAt = Date.now();

  // Parse structured data from #application_config
  const communityConfig = parseCommunityConfig(readConfigAttribute('data-community'));
  const events = parsePartnerEventStore(readConfigAttribute('data-partnereventstore'));

  // Determine App ID: prefer structured config, fallback to URL
  const appId = communityConfig?.appId ?? extractAppIdFromUrl(url);

  // Determine page variant
  const pageVariant = detectPageVariant(url);

  // Find the current event being edited (match GID from URL)
  const eventGid = extractEventGidFromUrl(url);
  const currentEvent = findEventByGid(events, eventGid);

  // Determine if this is an announcement editor
  const isAnnouncementEditor = pageVariant === 'partner-announcement';

  // Try to find editor DOM elements
  const titleField = findTitleField();
  const subtitleField = findSubtitleField();
  const bodyField = findBodyField();

  // Get text content: prefer DOM field values, fallback to structured data
  const existingTitle =
    getFieldText(titleField) ||
    currentEvent?.announcementBody?.headline ||
    currentEvent?.eventName ||
    '';

  const existingSubtitle =
    getFieldText(subtitleField) ||
    currentEvent?.jsonData?.localizedSubtitle?.[0] ||
    '';

  const existingBody =
    getFieldText(bodyField) ||
    currentEvent?.announcementBody?.body ||
    '';

  return {
    isAnnouncementEditor,
    appId,
    editorState: {
      titleField,
      subtitleField,
      bodyField,
      existingTitle,
      existingSubtitle,
      existingBody,
    },
    pageVariant,
    detectedAt,
  };
}

// ─── Serialization (for sending to popup via chrome messaging) ───────────────

function serializeContext(
  ctx: PageContext,
  communityConfig: SteamCommunityConfig | null,
  event: SteamEventData | null,
  eventGid: string | null
): SerializedPageContext {
  return {
    isAnnouncementEditor: ctx.isAnnouncementEditor,
    appId: ctx.appId,
    editorState: {
      hasTitleField: ctx.editorState.titleField !== null,
      hasSubtitleField: ctx.editorState.subtitleField !== null,
      hasBodyField: ctx.editorState.bodyField !== null,
      existingTitle: ctx.editorState.existingTitle,
      existingSubtitle: ctx.editorState.existingSubtitle,
      existingBody: ctx.editorState.existingBody,
    },
    pageVariant: ctx.pageVariant,
    detectedAt: ctx.detectedAt,
    eventGid,
    event,
    communityConfig,
  };
}

// ─── Cached context + message handler ────────────────────────────────────────

let cachedContext: SerializedPageContext | null = null;

async function initContext() {
  const url = window.location.href;
  const communityConfig = parseCommunityConfig(readConfigAttribute('data-community'));
  const events = parsePartnerEventStore(readConfigAttribute('data-partnereventstore'));
  const eventGid = extractEventGidFromUrl(url);
  const currentEvent = findEventByGid(events, eventGid);

  const ctx = await detectPageContext();
  cachedContext = serializeContext(ctx, communityConfig, currentEvent, eventGid);

  // Notify the service worker that context is available (for badge updates)
  try {
    chrome.runtime.sendMessage({
      type: 'PAGE_CONTEXT_READY',
      context: cachedContext,
    });
  } catch {
    // Extension might not be ready yet — non-fatal
  }
}

// Run detection on page load
initContext();

/**
 * Run a fresh detection and return a serialized context.
 * Called on every GET_PAGE_CONTEXT request so the popup always gets
 * current editor values — avoids stale cache from before the SPA hydrated.
 */
async function freshDetect(): Promise<SerializedPageContext> {
  const url = window.location.href;
  const communityConfig = parseCommunityConfig(readConfigAttribute('data-community'));
  const events = parsePartnerEventStore(readConfigAttribute('data-partnereventstore'));
  const eventGid = extractEventGidFromUrl(url);
  const currentEvent = findEventByGid(events, eventGid);

  const ctx = await detectPageContext();
  return serializeContext(ctx, communityConfig, currentEvent, eventGid);
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_APP_ID') {
    // Legacy support
    sendResponse({ appId: cachedContext?.appId ?? null });
    return true;
  }

  if (message.type === 'GET_PAGE_CONTEXT') {
    // Always re-detect fresh — the editor content may not have been loaded
    // when the content script first ran (SPA hydration race condition)
    freshDetect().then((ctx) => {
      cachedContext = ctx;
      sendResponse(ctx);
    });
    return true; // keep channel open for async
  }
});
