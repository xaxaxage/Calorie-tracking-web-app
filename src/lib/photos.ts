import { useEffect, useState } from 'preact/hooks';
import type { MealId } from './types';

/**
 * Meal photos, kept on this device in IndexedDB (too big for the log or for
 * sync). Each is the JPEG the photo estimate used, with the day and meal it
 * was taken for.
 */

export interface MealPhoto {
  id: string;
  at: number;
  date: string;
  meal: MealId;
  blob: Blob;
  /** What the person wrote with it, if anything. */
  note?: string;
}

const DB_NAME = 'calorie-tracker-photos';
const STORE = 'photos';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('This browser cannot store photos.'));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('date', 'date');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Could not open photo storage.'));
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = work(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error ?? req.error ?? new Error('Photo storage failed.'));
        tx.onabort = () => reject(tx.error ?? new Error('Photo storage failed.'));
      }),
  );
}

const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

export function subscribePhotos(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function newId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** The JPEG behind a data URL. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, data] = dataUrl.split(',', 2);
  const type = /data:([^;,]+)/.exec(head)?.[1] ?? 'image/jpeg';
  const bin = atob(data ?? '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function savePhoto(photo: Omit<MealPhoto, 'id' | 'at'> & { at?: number }): Promise<MealPhoto> {
  const saved: MealPhoto = { id: newId(), at: photo.at ?? Date.now(), ...photo };
  if (!saved.note) delete saved.note;
  await run('readwrite', (s) => s.put(saved));
  changed();
  return saved;
}

export async function listPhotos(): Promise<MealPhoto[]> {
  const all = await run<MealPhoto[]>('readonly', (s) => s.getAll());
  return all.sort((a, b) => b.at - a.at);
}

export async function photosFor(date: string, meal?: MealId): Promise<MealPhoto[]> {
  const day = await run<MealPhoto[]>('readonly', (s) => s.index('date').getAll(date));
  return day.filter((p) => !meal || p.meal === meal).sort((a, b) => a.at - b.at);
}

export async function deletePhoto(id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(id));
  changed();
}

export async function deleteAllPhotos(): Promise<void> {
  await run('readwrite', (s) => s.clear());
  changed();
}

/** Photos matching a query, kept up to date; `null` while loading. */
export function usePhotos(load: () => Promise<MealPhoto[]>, deps: unknown[]): MealPhoto[] | null {
  const [photos, setPhotos] = useState<MealPhoto[] | null>(null);
  useEffect(() => {
    let live = true;
    const refresh = () =>
      load()
        .then((p) => live && setPhotos(p))
        .catch(() => live && setPhotos([]));
    refresh();
    const unsubscribe = subscribePhotos(refresh);
    return () => {
      live = false;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return photos;
}

/** Object URLs for showing photos, released when they're no longer shown. */
export function usePhotoUrls(photos: MealPhoto[] | null): Map<string, string> {
  const [urls, setUrls] = useState(() => new Map<string, string>());
  useEffect(() => {
    const next = new Map((photos ?? []).map((p) => [p.id, URL.createObjectURL(p.blob)]));
    setUrls(next);
    return () => next.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);
  return urls;
}

/** "meal-2026-09-26-lunch-1432.jpg" */
export function photoFileName(p: Pick<MealPhoto, 'at' | 'date' | 'meal'>): string {
  const d = new Date(p.at);
  const hhmm = `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  return `meal-${p.date}-${p.meal}-${hhmm}.jpg`;
}

/**
 * Put photos in the phone's Photos app. iPhone only allows that through the
 * share sheet ("Save Image"); elsewhere the photos are downloaded. Call it
 * straight from a tap, with the photos already loaded.
 */
export async function saveToPhotos(photos: Pick<MealPhoto, 'blob' | 'at' | 'date' | 'meal'>[]): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const files = photos.map((p) => new File([p.blob], photoFileName(p), { type: p.blob.type || 'image/jpeg' }));
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files })) {
    try {
      await navigator.share({ files });
      return 'shared';
    } catch (err) {
      if ((err as Error).name === 'AbortError') return 'cancelled';
      // Not allowed (e.g. no tap to go with it): fall back to downloading.
    }
  }
  for (const file of files) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
  return 'downloaded';
}

export function totalBytes(photos: MealPhoto[]): number {
  return photos.reduce((t, p) => t + (p.blob?.size ?? 0), 0);
}

export function fmtBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
