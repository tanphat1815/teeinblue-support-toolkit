import { DB } from './constants';

export interface CaptureRecord {
  id: string;
  blob: Blob;
  sourceUrl: string;
  createdAt: number;
  crop?: { x: number; y: number; w: number; h: number }; // px của ảnh gốc
  dataUrl?: string; // thumbnail base64 phục vụ render nhanh
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

export async function listAllRecords(): Promise<CaptureRecord[]> {
  const all = await run<CaptureRecord[]>('readonly', (s) => s.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function purgeOld(maxAgeMs = 7 * 24 * 3600 * 1000) {
  const all = await listAllRecords();
  // Giữ lại 50 ảnh gần nhất hoặc xóa ảnh cũ hơn 7 ngày
  const toDelete = all.filter((r, idx) => idx >= 50 || Date.now() - r.createdAt > maxAgeMs);
  await Promise.all(toDelete.map((r) => deleteRecord(r.id)));
}
