/**
 * Content script that detects Steam page context.
 *
 * Runs on Steam store, partner, and community pages.
 * detectPageContext() is the primary entry point — it reads the DOM once,
 * parses structured data from #application_config, and returns a LivePageContext.
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
import type { PageContext } from '@announcekit/core';

// ─── LivePageContext: extension-only superset with DOM handles ───────────────
//
// Core's PageContext is the serializable source of truth. In the content script
// we additionally hold live HTMLElement references so we can write back to the
// editor fields later. Those handles never cross the message boundary.

export type LivePageContext = PageContext & {
  liveFields: {
    titleField: HTMLElement | null;
    subtitleField: HTMLElement | null;
    bodyField: HTMLElement | null;
  };
};

// Re-export the serializable shape under its legacy name so the popup keeps
// compiling while we finish migrating consumers.
export type SerializedPageContext = PageContext;

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
 * LOCALIZATION WARNING: These placeholder strings are English-only.
 *     If Steam localizes their editor UI (i.e. the placeholder text changes
 *     based on the user's Steam language setting), these selectors will fail
 *     for non-English users. The function degrades gracefully to null in that
 *     case, and we fall back to structured data from data-partnereventstore.
 * ─────────────────────────────────────────────────────────────────────────────
 */

function findFieldByPlaceholder(placeholder: string): HTMLElement | null {
  try {
    const input = document.querySelector<HTMLElement>(
      `input[placeholder="${CSS.escape(placeholder)}"]`
    );
    if (input) return input;

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
 * Synchronous — any future async work (e.g. awaiting SPA hydration) should be
 * wrapped at the call site, not baked into the parse itself.
 */
export function detectPageContext(): LivePageContext {
  const url = window.location.href;
  const detectedAt = Date.now();

  // Parse structured data from #application_config (single pass)
  const communityConfig = parseCommunityConfig(readConfigAttribute('data-community'));
  const events = parsePartnerEventStore(readConfigAttribute('data-partnereventstore'));

  // App ID: prefer structured config, fallback to URL
  const appId = communityConfig?.appId ?? extractAppIdFromUrl(url);

  const pageVariant = detectPageVariant(url);

  const eventGid = extractEventGidFromUrl(url);
  const currentEvent = findEventByGid(events, eventGid);

  const isAnnouncementEditor = pageVariant === 'partner-announcement';

  const titleField = findTitleField();
  const subtitleField = findSubtitleField();
  const bodyField = findBodyField();

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
    pageVariant,
    detectedAt,
    editorState: {
      hasTitleField: titleField !== null,
      hasSubtitleField: subtitleField !== null,
      hasBodyField: bodyField !== null,
      existingTitle,
      existingSubtitle,
      existingBody,
    },
    eventGid,
    event: currentEvent,
    communityConfig,
    liveFields: {
      titleField,
      subtitleField,
      bodyField,
    },
  };
}

/**
 * Strip the live DOM handles — this is the shape sent across the message
 * boundary. PageContext is already the serializable shape; we just drop
 * liveFields.
 */
function toSerializable(ctx: LivePageContext): PageContext {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { liveFields, ...serializable } = ctx;
  return serializable;
}

// ─── Cached context + message handler ────────────────────────────────────────

let cachedContext: PageContext | null = null;

function initContext() {
  const ctx = detectPageContext();
  cachedContext = toSerializable(ctx);

  try {
    chrome.runtime.sendMessage({
      type: 'PAGE_CONTEXT_READY',
      context: cachedContext,
    });
  } catch {
    // Extension might not be ready yet — non-fatal
  }
}

initContext();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_APP_ID') {
    sendResponse({ appId: cachedContext?.appId ?? null });
    return true;
  }

  if (message.type === 'GET_PAGE_CONTEXT') {
    // Re-detect fresh — editor content may not have been hydrated when the
    // content script first ran (SPA hydration race).
    const fresh = toSerializable(detectPageContext());
    cachedContext = fresh;
    sendResponse(fresh);
    return true;
  }
});
