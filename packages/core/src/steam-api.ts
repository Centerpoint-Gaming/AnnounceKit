import type { SteamAppDetails } from './types.js';

/**
 * Parse the raw Steam Store API response into a clean SteamAppDetails object.
 * This is a pure function with no fetch/network dependencies.
 */
export function parseSteamAppDetails(
  appId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawResponse: Record<string, any>
): SteamAppDetails | null {
  const entry = rawResponse[appId];
  if (!entry?.success || !entry.data) {
    return null;
  }

  const data = entry.data;

  return {
    appId,
    name: data.name ?? '',
    shortDescription: data.short_description ?? '',
    genres: (data.genres ?? []).map((g: { description: string }) => g.description),
    categories: (data.categories ?? []).map((c: { description: string }) => c.description),
    headerImage: data.header_image ?? '',
    screenshots: (data.screenshots ?? []).map(
      (s: { id: number; path_full: string }) => ({
        id: s.id,
        pathFull: s.path_full,
      })
    ),
    background: data.background_raw ?? data.background ?? null,
    capsuleImage: data.capsule_imagev5 ?? data.capsule_image ?? null,
  };
}
