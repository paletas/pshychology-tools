import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';

// Only reference data is ever stored here: keys `active` (sha) and `bundle:<sha>` (bundle text).
const DB_NAME = 'wisc3-refdata';
const STORE = 'kv';

export type RefStore = IDBPDatabase;

export const bundleKey = (sha: string) => `bundle:${sha}`;

export function openStore(): Promise<RefStore> {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE);
    },
  });
}

export async function readActive(db: RefStore): Promise<{ sha: string; text: string } | null> {
  const sha = await db.get(STORE, 'active');
  if (typeof sha !== 'string') return null;
  const text = await db.get(STORE, bundleKey(sha));
  return typeof text === 'string' ? { sha, text } : null;
}

/** Writes the bundle and flips `active` in one transaction. */
export async function writeActive(db: RefStore, sha: string, text: string): Promise<void> {
  const tx = db.transaction(STORE, 'readwrite');
  await Promise.all([tx.store.put(text, bundleKey(sha)), tx.store.put(sha, 'active'), tx.done]);
}

export async function deleteBundle(db: RefStore, sha: string): Promise<void> {
  await db.delete(STORE, bundleKey(sha));
}
