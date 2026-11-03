import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';

// Offline event queue. Holds only enum-built events (see events.ts). Every IDB failure is swallowed:
// analytics must never throw into the app.
const DB_NAME = 'wisc3-events';
const STORE = 'events';
const MAX_EVENTS = 500;
const MAX_AGE_S = 30 * 24 * 60 * 60;

export type QueuedEvent = { id: string; name: string; data: Record<string, string | boolean>; ts: number };

let dbPromise: Promise<IDBPDatabase> | null = null;
let inflight: Promise<void> | null = null;

function getDb(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(db) {
      const store = db.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('ts', 'ts');
    },
  });
  return dbPromise;
}

export async function enqueue(name: string, data: Record<string, string | boolean>): Promise<void> {
  try {
    const db = await getDb();
    const rec: QueuedEvent = { id: crypto.randomUUID(), name, data, ts: Math.floor(Date.now() / 1000) };
    await db.put(STORE, rec);
    await prune(db);
  } catch {
    /* swallowed */
  }
}

async function prune(db: IDBPDatabase): Promise<void> {
  const cutoff = Math.floor(Date.now() / 1000) - MAX_AGE_S;
  const tx = db.transaction(STORE, 'readwrite');
  const idx = tx.store.index('ts');
  for (let c = await idx.openCursor(IDBKeyRange.upperBound(cutoff, true)); c; c = await c.continue()) {
    await c.delete();
  }
  let excess = (await tx.store.count()) - MAX_EVENTS;
  for (let c = await idx.openCursor(); c && excess > 0; c = await c.continue()) {
    await c.delete();
    excess--;
  }
  await tx.done;
}

/** Oldest first. */
export async function peek(limit = 50): Promise<QueuedEvent[]> {
  try {
    const db = await getDb();
    const out: QueuedEvent[] = [];
    const tx = db.transaction(STORE, 'readonly');
    for (let c = await tx.store.index('ts').openCursor(); c && out.length < limit; c = await c.continue()) {
      out.push(c.value as QueuedEvent);
    }
    return out;
  } catch {
    return [];
  }
}

export async function remove(ids: string[]): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction(STORE, 'readwrite');
    await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
  } catch {
    /* swallowed */
  }
}

/** Sends oldest first, deletes a record only when `send` resolves true, stops at the first failure. Concurrent calls share one run. */
export function flush(send: (e: QueuedEvent) => Promise<boolean>): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      for (;;) {
        const batch = await peek(50);
        if (!batch.length) return;
        for (const e of batch) {
          let ok = false;
          try {
            ok = await send(e);
          } catch {
            ok = false;
          }
          if (!ok) return;
          await remove([e.id]);
        }
      }
    } catch {
      /* swallowed */
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export async function __resetQueueForTests(): Promise<void> {
  inflight = null;
  const p = dbPromise;
  dbPromise = null;
  try {
    (await p)?.close();
  } catch {
    /* ignore */
  }
}
