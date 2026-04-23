/**
 * Contract: fetchStoreMetadata
 *
 * Given an app ID, pull everything Steam's public store API and store page
 * expose. Returns a Result type — never throws.
 *
 * Data sources:
 *   - Primary: Steam appdetails API (name, description, genres, categories,
 *     images, developer, publisher, release date)
 *   - Fallback: Store page HTML scrape (user tags — the API does not expose
 *     these, only genres/categories)
 *   - Constructed: Library hero URL follows a predictable CDN pattern
 *
 * Region handling:
 *   Defaults to US region (?cc=us) for consistency across users. Some apps
 *   return different data or are invisible in certain regions; the US default
 *   provides the broadest coverage.
 *
 * Performance budget: <2s typical, 5s hard timeout.
 * Side effects: Network reads only, no storage writes.
 */

import type { Result } from './result.js';
import { ok, err } from './result.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ReleaseStatus = 'released' | 'early-access' | 'coming-soon' | 'unknown';

export interface StoreMetadataAssets {
  capsule: string;
  header: string;
  library: string;
  screenshots: string[];
  background: string | null;
}

export interface StoreMetadata {
  appId: string;
  name: string;
  shortDescription: string;
  tags: string[];
  genres: string[];
  categories: string[];
  releaseDate: string | null;
  releaseStatus: ReleaseStatus;
  developer: string;
  publisher: string;
  assets: StoreMetadataAssets;
  fetchedAt: number;
  source: 'api' | 'scrape' | 'mixed';
}

export type StoreFetchErrorReason =
  | 'not-found'
  | 'rate-limited'
  | 'network-error'
  | 'timeout'
  | 'aborted'
  | 'parse-error'
  | 'unknown';

export interface StoreFetchError {
  reason: StoreFetchErrorReason;
  message: string;
  retryAfter?: number;
  statusCode?: number;
}

export interface FetchStoreMetadataOptions {
  timeout?: number;
  signal?: AbortSignal;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT = 5000;
const STEAM_API_BASE = 'https://store.steampowered.com';
const STEAM_CDN_BASE = 'https://cdn.akamai.steamstatic.com/steam/apps';
const MAX_SCREENSHOTS = 8;

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Create an AbortSignal that fires on timeout OR when the caller's signal fires,
 * whichever comes first.
 */
function createCombinedSignal(
  timeoutMs: number,
  callerSignal?: AbortSignal
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

/**
 * Classify a fetch failure into a StoreFetchError.
 */
function classifyFetchError(error: unknown, context: string): StoreFetchError {
  if (error instanceof Error) {
    if (error.message === 'timeout') {
      return { reason: 'timeout', message: `${context}: request timed out` };
    }
    if (error.name === 'AbortError' || error.message.includes('abort')) {
      return { reason: 'aborted', message: `${context}: request was aborted` };
    }
    return { reason: 'network-error', message: `${context}: ${error.message}` };
  }
  return { reason: 'unknown', message: `${context}: unknown error` };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deriveReleaseStatus(data: any): ReleaseStatus {
  // Check genres for "Early Access"
  const genres: { description: string }[] = data.genres ?? [];
  if (genres.some((g) => g.description === 'Early Access')) {
    return 'early-access';
  }

  const releaseDate = data.release_date;
  if (!releaseDate) return 'unknown';

  if (releaseDate.coming_soon === true) return 'coming-soon';
  if (releaseDate.date) return 'released';

  return 'unknown';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseApiResponse(appId: string, data: any): StoreMetadata | null {
  const entry = data[appId];
  if (!entry?.success || !entry.data) return null;

  const d = entry.data;
  const genres = (d.genres ?? []).map((g: { description: string }) => g.description);
  const categories = (d.categories ?? []).map((c: { description: string }) => c.description);

  const screenshots: string[] = (d.screenshots ?? [])
    .slice(0, MAX_SCREENSHOTS)
    .map((s: { path_full: string }) => s.path_full);

  return {
    appId,
    name: d.name ?? '',
    shortDescription: d.short_description ?? '',
    tags: [], // API does not expose user tags — filled by scrape fallback
    genres,
    categories,
    releaseDate: d.release_date?.date ?? null,
    releaseStatus: deriveReleaseStatus(d),
    developer: (d.developers ?? [])[0] ?? '',
    publisher: (d.publishers ?? [])[0] ?? '',
    assets: {
      capsule: d.capsule_imagev5 ?? d.capsule_image ?? '',
      header: d.header_image ?? '',
      library: `${STEAM_CDN_BASE}/${appId}/library_hero.jpg`,
      screenshots,
      background: d.background_raw ?? d.background ?? null,
    },
    fetchedAt: Date.now(),
    source: 'api',
  };
}

/**
 * Extract user tags from the Steam store page HTML.
 *
 * Steam embeds tag data in a script block as InitAppTagModal with a JSON array
 * of { tagid, name, count } objects. We parse that rather than querying the DOM.
 */
function parseTagsFromStorePage(html: string): string[] {
  try {
    // Pattern: InitAppTagModal( appid, [ {tagid:..., name:"...", ...}, ... ] )
    const match = html.match(/InitAppTagModal\(\s*\d+\s*,\s*(\[[\s\S]*?\])\s*,/);
    if (match) {
      const tagsJson = JSON.parse(match[1]);
      return tagsJson
        .slice(0, 20)
        .map((t: { name: string }) => t.name)
        .filter((n: string) => n);
    }

    // Fallback: look for data-tagid elements in the tag cloud
    const tagPattern = /<a[^>]*class="app_tag"[^>]*>([\s\S]*?)<\/a>/g;
    const tags: string[] = [];
    let tagMatch;
    while ((tagMatch = tagPattern.exec(html)) !== null && tags.length < 20) {
      const tagName = tagMatch[1].replace(/&#(\d+);/g, (_, code) =>
        String.fromCharCode(Number(code))
      ).trim();
      if (tagName && tagName !== '+') tags.push(tagName);
    }
    return tags;
  } catch {
    return [];
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function fetchStoreMetadata(
  appId: string,
  options?: FetchStoreMetadataOptions
): Promise<Result<StoreMetadata, StoreFetchError>> {
  // Validate input
  if (!appId || !/^\d+$/.test(appId)) {
    return err({ reason: 'not-found', message: `Invalid app ID: "${appId}"` });
  }

  // Check if already aborted
  if (options?.signal?.aborted) {
    return err({ reason: 'aborted', message: 'Request was aborted before it started' });
  }

  const timeoutMs = Math.min(options?.timeout ?? DEFAULT_TIMEOUT, DEFAULT_TIMEOUT);
  const { signal, cleanup } = createCombinedSignal(timeoutMs, options?.signal);

  try {
    // ── Step 1: Fetch from Steam appdetails API (primary source) ────────

    const apiUrl = `${STEAM_API_BASE}/api/appdetails?appids=${appId}&cc=us&l=english`;
    let apiResponse: Response;

    try {
      apiResponse = await fetch(apiUrl, { signal });
    } catch (fetchErr) {
      return err(classifyFetchError(fetchErr, 'Steam API'));
    }

    // Handle HTTP-level errors
    if (apiResponse.status === 429) {
      const retryAfter = Number(apiResponse.headers.get('retry-after')) || undefined;
      return err({
        reason: 'rate-limited',
        message: 'Steam API rate limit exceeded',
        retryAfter,
        statusCode: 429,
      });
    }

    if (!apiResponse.ok) {
      return err({
        reason: 'network-error',
        message: `Steam API returned HTTP ${apiResponse.status}`,
        statusCode: apiResponse.status,
      });
    }

    let apiData: unknown;
    try {
      apiData = await apiResponse.json();
    } catch {
      return err({ reason: 'parse-error', message: 'Failed to parse Steam API JSON response' });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metadata = parseApiResponse(appId, apiData as Record<string, any>);
    if (!metadata) {
      return err({
        reason: 'not-found',
        message: `App ${appId} not found or response was unsuccessful`,
      });
    }

    // Bail early if aborted during API parsing
    if (signal.aborted) {
      return err({ reason: 'aborted', message: 'Request aborted after API fetch' });
    }

    // ── Step 2: Scrape store page for user tags (API doesn't expose them) ─

    try {
      const storeUrl = `${STEAM_API_BASE}/app/${appId}?cc=us&l=english`;
      const pageResponse = await fetch(storeUrl, { signal });

      if (pageResponse.ok) {
        const html = await pageResponse.text();
        const tags = parseTagsFromStorePage(html);

        if (tags.length > 0) {
          metadata.tags = tags;
          metadata.source = 'mixed';
        }
      }
      // Non-ok store page response is non-fatal — we just won't have tags
    } catch {
      // Tag scrape failure is non-fatal — we still have API data
    }

    return ok(metadata);
  } finally {
    cleanup();
  }
}
