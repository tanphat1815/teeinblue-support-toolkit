import { DB } from './constants';

export interface CaptureRecord {
  id: string;
  blob: Blob;
  sourceUrl: string;
  createdAt: number;
  crop?: { x: number; y: number; w: number; h: number }; // px của ảnh gốc
}

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB.name, DB.version);
    r.onupgradeneeded = () => r.result.createObjectStore(DB.store, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((res, rej) => {
    const t = db.transaction(DB.store, mode);
    const rq = fn(t.objectStore(DB.store));
    t.oncomplete = () => {
      db.close();
      res(rq.result);
    };
    t.onerror = () => {
      db.close();
      rej(t.error);
    };
    t.onabort = () => {
      db.close();
      rej(t.error);
    };
  });
}

export const putRecord = (r: CaptureRecord) => run('readwrite', (s) => s.put(r));
export const getRecord = (id: string) => run<CaptureRecord | undefined>('readonly', (s) => s.get(id));
export const deleteRecord = (id: string) => run('readwrite', (s) => s.delete(id));

export async function purgeOld(maxAgeMs = 24 * 3600 * 1000) {
  const all = await run<CaptureRecord[]>('readonly', (s) => s.getAll());
  await Promise.all(all.filter((r) => Date.now() - r.createdAt > maxAgeMs).map((r) => deleteRecord(r.id)));
}
