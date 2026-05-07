/**
 * IndexedDB-backed ThumbnailCache for the chrome medium.
 *
 * Metadata only — bytes live in the BinaryStore (content-addressed). One IDB
 * database, one object store with two indexes:
 *   - byApp:             [appId]               → list-by-app queries
 *   - byAppAnnouncement: [appId, announcementId] → list-by-announcement queries
 *
 * IDB compound keys can include null, so draft records (announcementId === null)
 * are addressable via the same index without a separate "drafts" store.
 */

import type {
  NewThumbnailRecord,
  Result,
  ThumbnailCache,
  ThumbnailCacheError,
  ThumbnailRecord,
} from '@announcekit/core';
import { err, ok } from '@announcekit/core';

const DB_NAME = 'announcekit-thumbnails';
const DB_VERSION = 1;
const STORE = 'thumbnails';
const IDX_BY_APP = 'byApp';
const IDX_BY_APP_ANNOUNCEMENT = 'byAppAnnouncement';

// IndexedDB indexes don't accept null in keys. Map null announcementId to this
// sentinel so draft records are still indexable. Reads convert it back.
const NULL_ANNOUNCEMENT_KEY = '__draft__';

interface PersistedRecord extends Omit<ThumbnailRecord, 'announcementId'> {
  announcementId: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex(IDX_BY_APP, 'appId');
        store.createIndex(IDX_BY_APP_ANNOUNCEMENT, ['appId', 'announcementId']);
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

function classifyError(e: unknown): ThumbnailCacheError {
  const msg = e instanceof Error ? e.message : String(e);
  const name = e instanceof Error ? e.name : '';
  if (name === 'QuotaExceededError' || /quota|full/i.test(msg)) {
    return { reason: 'storage-full', message: msg };
  }
  return { reason: 'storage-unavailable', message: msg };
}

function toPersisted(rec: ThumbnailRecord): PersistedRecord {
  return { ...rec, announcementId: rec.announcementId ?? NULL_ANNOUNCEMENT_KEY };
}

function fromPersisted(rec: PersistedRecord): ThumbnailRecord {
  return {
    ...rec,
    announcementId:
      rec.announcementId === NULL_ANNOUNCEMENT_KEY ? null : rec.announcementId,
  };
}

export function createIndexedDBThumbnailCache(): ThumbnailCache {
  return {
    async put(
      input: NewThumbnailRecord,
    ): Promise<Result<ThumbnailRecord, ThumbnailCacheError>> {
      try {
        const record: ThumbnailRecord = { id: crypto.randomUUID(), ...input };
        await runRequest<IDBValidKey>('readwrite', (s) => s.put(toPersisted(record)));
        return ok(record);
      } catch (e) {
        return err(classifyError(e));
      }
    },

    async listForAnnouncement(
      appId,
      announcementId,
    ): Promise<Result<ThumbnailRecord[], ThumbnailCacheError>> {
      try {
        const key: [string, string] = [
          appId,
          announcementId ?? NULL_ANNOUNCEMENT_KEY,
        ];
        const raw = await runRequest<PersistedRecord[]>('readonly', (s) =>
          s.index(IDX_BY_APP_ANNOUNCEMENT).getAll(IDBKeyRange.only(key)),
        );
        const out = raw.map(fromPersisted).sort((a, b) => b.generatedAt - a.generatedAt);
        return ok(out);
      } catch (e) {
        return err(classifyError(e));
      }
    },

    async listForApp(
      appId,
    ): Promise<Result<ThumbnailRecord[], ThumbnailCacheError>> {
      try {
        const raw = await runRequest<PersistedRecord[]>('readonly', (s) =>
          s.index(IDX_BY_APP).getAll(IDBKeyRange.only(appId)),
        );
        const out = raw.map(fromPersisted).sort((a, b) => b.generatedAt - a.generatedAt);
        return ok(out);
      } catch (e) {
        return err(classifyError(e));
      }
    },

    async delete(id: string): Promise<Result<void, ThumbnailCacheError>> {
      try {
        await runRequest<undefined>('readwrite', (s) => s.delete(id));
        return ok(undefined);
      } catch (e) {
        return err(classifyError(e));
      }
    },
  };
}
