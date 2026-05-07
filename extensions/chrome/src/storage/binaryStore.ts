/**
 * IndexedDB-backed BinaryStore for the chrome medium.
 *
 * Bytes live in IndexedDB keyed by SHA-256 hex digest, separate from
 * chrome.storage.local where StoredAsset metadata lives. This keeps the
 * profile cache row tiny and gives us effectively-unbounded space for
 * uploaded brand assets (subject only to the browser's per-origin quota,
 * which is gigabytes — not the 10MB chrome.storage.local cap).
 */

import type {
  BinaryRecord,
  BinaryStore,
  BinaryStoreError,
  Result,
} from '@announcekit/core';
import { err, hashBytes, ok } from '@announcekit/core';

const DB_NAME = 'announcekit-binaries';
const DB_VERSION = 1;
const STORE = 'binaries';

interface PersistedRecord {
  binaryRef: string;
  mimeType: string;
  bytes: ArrayBuffer;
  byteCount: number;
  addedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'binaryRef' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function runRequest<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

function classifyError(e: unknown): BinaryStoreError {
  const msg = e instanceof Error ? e.message : String(e);
  const name = e instanceof Error ? e.name : '';
  if (name === 'QuotaExceededError' || /quota|full/i.test(msg)) {
    return { reason: 'storage-full', message: msg };
  }
  return { reason: 'storage-unavailable', message: msg };
}

function toFreshArrayBuffer(view: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(view.byteLength);
  new Uint8Array(out).set(view);
  return out;
}

export function createIndexedDBBinaryStore(): BinaryStore {
  return {
    async put(
      bytes: Uint8Array,
      mimeType: string,
    ): Promise<Result<BinaryRecord, BinaryStoreError>> {
      try {
        const binaryRef = await hashBytes(bytes);
        const record: PersistedRecord = {
          binaryRef,
          mimeType,
          bytes: toFreshArrayBuffer(bytes),
          byteCount: bytes.byteLength,
          addedAt: Date.now(),
        };
        await runRequest<IDBValidKey>('readwrite', (s) => s.put(record));
        return ok({
          binaryRef,
          mimeType,
          bytes,
          byteCount: bytes.byteLength,
        });
      } catch (e) {
        return err(classifyError(e));
      }
    },

    async get(
      binaryRef: string,
    ): Promise<Result<BinaryRecord, BinaryStoreError>> {
      try {
        const raw = await runRequest<PersistedRecord | undefined>(
          'readonly',
          (s) => s.get(binaryRef),
        );
        if (!raw) {
          return err({
            reason: 'not-found',
            message: `No binary stored for ${binaryRef}`,
          });
        }
        return ok({
          binaryRef: raw.binaryRef,
          mimeType: raw.mimeType,
          bytes: new Uint8Array(raw.bytes),
          byteCount: raw.byteCount,
        });
      } catch (e) {
        return err(classifyError(e));
      }
    },

    async has(binaryRef: string): Promise<boolean> {
      try {
        const count = await runRequest<number>('readonly', (s) =>
          s.count(binaryRef),
        );
        return count > 0;
      } catch {
        return false;
      }
    },

    async delete(
      binaryRef: string,
    ): Promise<Result<void, BinaryStoreError>> {
      try {
        await runRequest<undefined>('readwrite', (s) => s.delete(binaryRef));
        return ok(undefined);
      } catch (e) {
        return err(classifyError(e));
      }
    },

    async list(): Promise<Result<string[], BinaryStoreError>> {
      try {
        const keys = await runRequest<IDBValidKey[]>('readonly', (s) =>
          s.getAllKeys(),
        );
        return ok(keys.map((k) => String(k)));
      } catch (e) {
        return err(classifyError(e));
      }
    },
  };
}
