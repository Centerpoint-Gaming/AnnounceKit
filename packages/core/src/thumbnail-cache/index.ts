/**
 * Contract: ThumbnailCache
 *
 * Persistent metadata store for generated thumbnails. Bytes live in the
 * BinaryStore (content-addressed by SHA-256 → automatic dedup); this contract
 * is metadata only.
 *
 * Records are keyed primarily by appId, secondarily by announcementId. The
 * announcementId is null for "draft" generations made outside an event editor
 * (no stable Steam GID yet) — those still group by appId so the future
 * "all history for this app" view picks them up.
 *
 * The medium owns persistence (IndexedDB in the chrome extension, an in-memory
 * Map in tests, etc.). Errors are enumerated; no throws cross the boundary.
 */

import type { Result } from '../result.js';

export interface ThumbnailRecord {
  id: string;
  appId: string;
  /** Steam event GID. Null when generated outside an event editor (draft). */
  announcementId: string | null;
  /** SHA-256 ref to bytes in the BinaryStore. */
  binaryRef: string;
  mimeType: string;
  byteCount: number;
  /** Full assembled prompt that produced this image. */
  prompt: string;
  /** Raw user direction at generation time, if any (ctx.userPrompt). */
  userPrompt: string | null;
  /** Model id, e.g. "gemini-3-pro-image-preview". */
  model: string;
  /** Reference image binaryRefs sent on the request (for replay/audit). */
  referenceBinaryRefs: string[];
  /** Snapshot of the announcement title at generation time. */
  announcementTitle: string | null;
  generatedAt: number;
}

export type ThumbnailCacheErrorReason =
  | 'storage-unavailable'
  | 'storage-full'
  | 'not-found';

export interface ThumbnailCacheError {
  reason: ThumbnailCacheErrorReason;
  message: string;
}

export type NewThumbnailRecord = Omit<ThumbnailRecord, 'id'>;

export interface ThumbnailCache {
  put(
    record: NewThumbnailRecord,
  ): Promise<Result<ThumbnailRecord, ThumbnailCacheError>>;

  /** Records for a specific (appId, announcementId) pair, newest first. */
  listForAnnouncement(
    appId: string,
    announcementId: string | null,
  ): Promise<Result<ThumbnailRecord[], ThumbnailCacheError>>;

  /** All records for an app, newest first. Used by the future "all history" view. */
  listForApp(
    appId: string,
  ): Promise<Result<ThumbnailRecord[], ThumbnailCacheError>>;

  delete(id: string): Promise<Result<void, ThumbnailCacheError>>;
}
