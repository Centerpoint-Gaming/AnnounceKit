/**
 * Pure parsing functions for extracting context from Steam's partner event pages.
 *
 * Steam embeds structured data in #application_config as data-* attributes.
 * These functions parse that data without touching the DOM — the content script
 * handles DOM access and passes raw JSON strings here.
 */

export type PageVariant = 'partner-announcement' | 'community-hub' | 'unknown';

export interface SteamCommunityConfig {
  appId: string | null;
  clanAccountId: string | null;
  clanSteamId: string | null;
  isOgg: boolean;
  canUploadImages: boolean;
}

export interface SteamEventData {
  gid: string;
  eventName: string;
  eventType: number;
  appId: number;
  announcementBody: {
    gid: string;
    headline: string;
    body: string;
    posttime: number;
    updatetime: number;
    language: number;
  } | null;
  jsonData: SteamEventJsonData | null;
}

export interface SteamEventJsonData {
  localizedSubtitle: (string | null)[];
  localizedTitleImage: (string | null)[];
  localizedCapsuleImage: (string | null)[];
}

/**
 * Canonical, serializable page context shape. This is what crosses the
 * message boundary between content script, service worker, and popup.
 *
 * Mediums may extend this with live handles (e.g. HTMLElement refs in the
 * content script) but the serialized form is the source of truth everywhere
 * else.
 */
export interface PageContext {
  isAnnouncementEditor: boolean;
  appId: string | null;
  pageVariant: PageVariant;
  detectedAt: number;
  editorState: {
    hasTitleField: boolean;
    hasSubtitleField: boolean;
    hasBodyField: boolean;
    existingTitle: string;
    existingSubtitle: string;
    existingBody: string;
  };
  eventGid: string | null;
  event: SteamEventData | null;
  communityConfig: SteamCommunityConfig | null;
}

/**
 * Parse the data-community attribute from #application_config.
 */
export function parseCommunityConfig(raw: string | null): SteamCommunityConfig | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return {
      appId: data.APPID != null ? String(data.APPID) : null,
      clanAccountId: data.CLANACCOUNTID != null ? String(data.CLANACCOUNTID) : null,
      clanSteamId: data.CLANSTEAMID ?? null,
      isOgg: data.IS_OGG === true,
      canUploadImages: data.CAN_UPLOAD_IMAGES === true,
    };
  } catch {
    return null;
  }
}

/**
 * Parse a single event entry from the data-partnereventstore array.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseEventEntry(entry: any): SteamEventData | null {
  if (!entry || typeof entry !== 'object') return null;
  try {
    let jsonData: SteamEventJsonData | null = null;
    if (entry.jsondata) {
      try {
        const jd = typeof entry.jsondata === 'string' ? JSON.parse(entry.jsondata) : entry.jsondata;
        jsonData = {
          localizedSubtitle: jd.localized_subtitle ?? [],
          localizedTitleImage: jd.localized_title_image ?? [],
          localizedCapsuleImage: jd.localized_capsule_image ?? [],
        };
      } catch {
        // jsondata parse failure is non-fatal
      }
    }

    const body = entry.announcement_body;
    return {
      gid: String(entry.gid ?? ''),
      eventName: entry.event_name ?? '',
      eventType: entry.event_type ?? 0,
      appId: entry.appid ?? 0,
      announcementBody: body
        ? {
            gid: String(body.gid ?? ''),
            headline: body.headline ?? '',
            body: body.body ?? '',
            posttime: body.posttime ?? 0,
            updatetime: body.updatetime ?? 0,
            language: body.language ?? 0,
          }
        : null,
      jsonData,
    };
  } catch {
    return null;
  }
}

/**
 * Parse the data-partnereventstore attribute and return all events.
 */
export function parsePartnerEventStore(raw: string | null): SteamEventData[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map(parseEventEntry).filter((e): e is SteamEventData => e !== null);
  } catch {
    return [];
  }
}

/**
 * Extract the event GID from a Steam partner events URL.
 * e.g. /games/1366800/partnerevents/edit/500604456516190730 → "500604456516190730"
 */
export function extractEventGidFromUrl(url: string): string | null {
  const match = url.match(/partnerevents\/edit\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Extract the App ID from a Steam URL path.
 */
export function extractAppIdFromUrl(url: string): string | null {
  const patterns = [
    /\/games\/(\d+)\//,
    /\/app\/(\d+)/,
    /\/apps\/\w+\/(\d+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Determine the page variant from a URL.
 */
export function detectPageVariant(url: string): PageVariant {
  if (/partnerevents\/edit\//.test(url)) return 'partner-announcement';
  if (/steamcommunity\.com\/(games|app)\//.test(url)) return 'community-hub';
  return 'unknown';
}

/**
 * Find the event matching a GID from a parsed event store array.
 */
export function findEventByGid(
  events: SteamEventData[],
  gid: string | null
): SteamEventData | null {
  if (!gid) return null;
  return events.find((e) => e.gid === gid) ?? null;
}
