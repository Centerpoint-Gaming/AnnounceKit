/**
 * Contract: fetchAppEvents
 *
 * Pull recent partner events (Steam announcements) for an app, including each
 * event's actual capsule thumbnail — the image shown in the news feed, not
 * an image extracted from the body content.
 *
 * Source: https://store.steampowered.com/events/ajaxgetpartnereventspageable/
 *
 * Why not ISteamNews:
 *   The v0002 ISteamNews API returns news items but does not surface the
 *   announcement's capsule thumbnail directly. Extracting the first image
 *   from `contents` returns body images, not the thumbnail. The events API
 *   exposes the localized capsule/title image filenames per event, which we
 *   resolve to CDN URLs.
 *
 * Inputs:
 *   - appId: Steam app id
 *   - clanAccountId: the developer/publisher clan's account id (a small
 *     integer). Available from the page context's parsed `data-community`
 *     attribute on every Steam page that exposes #application_config.
 *
 * Performance budget: <2s typical, 8s default timeout.
 * Side effects: Network reads only.
 */

import type { Result } from '../result.js';
import { ok, err } from '../result.js';

export interface AppEventAnnouncementBody {
  headline: string;
  body: string;
  posttime: number;
  updatetime: number;
}

export interface AppEvent {
  gid: string;
  appId: number;
  clanSteamId: string;
  eventName: string;
  eventType: number;
  startTime: number;
  endTime: number;
  capsuleImage: string | null;
  titleImage: string | null;
  announcementBody: AppEventAnnouncementBody | null;
}

export type AppEventsErrorReason =
  | 'not-found'
  | 'rate-limited'
  | 'network-error'
  | 'timeout'
  | 'aborted'
  | 'parse-error';

export interface AppEventsError {
  reason: AppEventsErrorReason;
  message: string;
  retryAfter?: number;
  statusCode?: number;
}

export interface FetchAppEventsOptions {
  appId: string;
  clanAccountId: string;
  count?: number;
  offset?: number;
  fetch?: typeof globalThis.fetch;
  timeout?: number;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT = 8000;
const DEFAULT_COUNT = 10;
const EVENTS_API_BASE =
  'https://store.steampowered.com/events/ajaxgetpartnereventspageable/';
const STEAM_CLAN_IMAGE_BASE =
  'https://clan.fastly.steamstatic.com/images';

function createCombinedSignal(
  timeoutMs: number,
  callerSignal?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  const onCallerAbort = () => controller.abort(callerSignal?.reason);
  callerSignal?.addEventListener('abort', onCallerAbort);
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    },
  };
}

function classifyFetchError(error: unknown, context: string): AppEventsError {
  if (error instanceof Error) {
    if (error.message === 'timeout') {
      return { reason: 'timeout', message: `${context}: request timed out` };
    }
    if (error.name === 'AbortError' || error.message.includes('abort')) {
      return { reason: 'aborted', message: `${context}: request was aborted` };
    }
    return { reason: 'network-error', message: `${context}: ${error.message}` };
  }
  return { reason: 'network-error', message: `${context}: unknown error` };
}

/**
 * Resolve a localized image filename to a full CDN URL. If `filename` is
 * already absolute it's returned as-is; otherwise it's combined with the
 * clan-image base and the clan account id.
 *
 * Steam stores partner-event capsule/title images under the *clan*, not the
 * event — the path is `<accountid>/<filename>`, not `<accountid>/<gid>/<filename>`.
 * This matches the {STEAM_CLAN_IMAGE} substitution Steam itself uses inside
 * announcement bodies (verified against captured page fixtures).
 */
export function resolveEventImageUrl(
  clanAccountId: string,
  filename: string | null | undefined,
): string | null {
  if (!filename) return null;
  if (/^https?:\/\//i.test(filename)) return filename;
  return `${STEAM_CLAN_IMAGE_BASE}/${clanAccountId}/${filename}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJsondata(raw: any): { capsule: string | null; title: string | null } {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { capsule: null, title: null };
    }
  }
  if (!parsed || typeof parsed !== 'object') return { capsule: null, title: null };
  const obj = parsed as Record<string, unknown>;
  const capsuleArr = Array.isArray(obj.localized_capsule_image)
    ? (obj.localized_capsule_image as unknown[])
    : [];
  const titleArr = Array.isArray(obj.localized_title_image)
    ? (obj.localized_title_image as unknown[])
    : [];
  // Prefer the first non-empty entry; older events sometimes have null/empty
  // entries for languages the developer didn't translate.
  const capsule = capsuleArr.find((s) => typeof s === 'string' && s.length > 0) ?? null;
  const title = titleArr.find((s) => typeof s === 'string' && s.length > 0) ?? null;
  return {
    capsule: typeof capsule === 'string' ? capsule : null,
    title: typeof title === 'string' ? title : null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseEvents(data: any, clanAccountId: string): AppEvent[] | null {
  const events = data?.events;
  if (!Array.isArray(events)) return null;

  return events
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((e: any): AppEvent | null => {
      const gid = String(e?.gid ?? '');
      if (!gid) return null;
      const { capsule, title } = parseJsondata(e?.jsondata);
      const ab = e?.announcement_body;
      return {
        gid,
        appId: typeof e.appid === 'number' ? e.appid : 0,
        clanSteamId: String(e.clan_steamid ?? ''),
        eventName: String(e.event_name ?? ''),
        eventType: typeof e.event_type === 'number' ? e.event_type : 0,
        startTime: typeof e.rtime32_start_time === 'number' ? e.rtime32_start_time : 0,
        endTime: typeof e.rtime32_end_time === 'number' ? e.rtime32_end_time : 0,
        capsuleImage: resolveEventImageUrl(clanAccountId, capsule),
        titleImage: resolveEventImageUrl(clanAccountId, title),
        announcementBody: ab
          ? {
              headline: String(ab.headline ?? ''),
              body: String(ab.body ?? ''),
              posttime: typeof ab.posttime === 'number' ? ab.posttime : 0,
              updatetime: typeof ab.updatetime === 'number' ? ab.updatetime : 0,
            }
          : null,
      };
    })
    .filter((e): e is AppEvent => e !== null);
}

export async function fetchAppEvents(
  options: FetchAppEventsOptions,
): Promise<Result<AppEvent[], AppEventsError>> {
  const { appId, clanAccountId } = options;
  if (!appId || !/^\d+$/.test(appId)) {
    return err({ reason: 'not-found', message: `Invalid app ID: "${appId}"` });
  }
  if (!clanAccountId || !/^\d+$/.test(clanAccountId)) {
    return err({
      reason: 'not-found',
      message: `Invalid clan account ID: "${clanAccountId}"`,
    });
  }

  if (options.signal?.aborted) {
    return err({ reason: 'aborted', message: 'Request was aborted before it started' });
  }

  const fetchImpl = options.fetch ?? globalThis.fetch;
  const count = options.count ?? DEFAULT_COUNT;
  const offset = options.offset ?? 0;
  const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT;
  const { signal, cleanup } = createCombinedSignal(timeoutMs, options.signal);

  try {
    const params = new URLSearchParams({
      clan_accountid: clanAccountId,
      appid: appId,
      offset: String(offset),
      count: String(count),
      l: 'english',
      origin: 'https://store.steampowered.com',
    });
    const url = `${EVENTS_API_BASE}?${params.toString()}`;

    let response: Response;
    try {
      response = await fetchImpl(url, { signal });
    } catch (e) {
      return err(classifyFetchError(e, 'Steam events API'));
    }

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after')) || undefined;
      return err({
        reason: 'rate-limited',
        message: 'Steam events API rate limit exceeded',
        retryAfter,
        statusCode: 429,
      });
    }

    if (!response.ok) {
      return err({
        reason: 'network-error',
        message: `Steam events API returned HTTP ${response.status}`,
        statusCode: response.status,
      });
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      return err({ reason: 'parse-error', message: 'Failed to parse events API JSON response' });
    }

    const items = parseEvents(data, clanAccountId);
    if (!items) {
      return err({
        reason: 'parse-error',
        message: 'Unexpected events API response shape',
      });
    }

    return ok(items);
  } finally {
    cleanup();
  }
}
