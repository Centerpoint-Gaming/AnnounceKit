/**
 * Contract: BinaryStore
 *
 * Content-addressed byte storage for brand assets. The pure interface — every
 * medium implements it over its own backend (IndexedDB in the chrome
 * extension, an in-memory Map in tests, etc.).
 *
 * Bytes are keyed by SHA-256 hex digest. Same content → same key, so put() is
 * idempotent and the StoredAsset metadata layer can dedup before writing.
 *
 * Errors are enumerated. No throws across the boundary.
 */

import type { Result } from '../result.js';

export type BinaryStoreErrorReason =
  | 'not-found'
  | 'storage-unavailable'
  | 'storage-full'
  | 'integrity-mismatch';

export interface BinaryStoreError {
  reason: BinaryStoreErrorReason;
  message: string;
}

export interface BinaryRecord {
  binaryRef: string;
  mimeType: string;
  bytes: Uint8Array;
  byteCount: number;
}

export interface BinaryStore {
  put(
    bytes: Uint8Array,
    mimeType: string,
  ): Promise<Result<BinaryRecord, BinaryStoreError>>;
  get(binaryRef: string): Promise<Result<BinaryRecord, BinaryStoreError>>;
  has(binaryRef: string): Promise<boolean>;
  delete(binaryRef: string): Promise<Result<void, BinaryStoreError>>;
  list(): Promise<Result<string[], BinaryStoreError>>;
}
