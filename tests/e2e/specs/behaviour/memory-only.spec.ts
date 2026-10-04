import { expect, test } from '@playwright/test';
import { blockAds } from '../helpers/adblock';
import { expectCase, fillCase, waitControlled, waitReady } from '../helpers/app';
import { caseFor, refData } from '../helpers/cases';
import { resetTmp } from '../helpers/tmp';

const BIRTH = '2015-03-14';
const TEST = '2024-05-20';

// C6: nothing about the child is ever stored; only the reference-data keys exist.
test('C6 nothing about the child is stored or sent', async ({ browser }) => {
  resetTmp();
  const context = await browser.newContext();
  await blockAds(context);
  const requests: { method: string; url: string }[] = [];
  context.on('request', (r) => requests.push({ method: r.method(), url: r.url() }));
  const page = await context.newPage();
  await page.goto('/wisc3');
  await waitControlled(page);
  await waitReady(page);

  const base = caseFor(refData(), 'memory-only', [9, 2, 6], '09y00m');
  const input = { ...base.input, testDate: TEST, birthDate: BIRTH };
  await fillCase(page, input);
  await expectCase(page, input);

  const stored = await page.evaluate(async () => {
    const idbDump: Record<string, { keys: string[]; text: string }> = {};
    const dbs = await indexedDB.databases();
    for (const info of dbs) {
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const req = indexedDB.open(info.name!);
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
      const keys: string[] = [];
      let text = '';
      for (const store of Array.from(db.objectStoreNames)) {
        const tx = db.transaction(store, 'readonly');
        const os = tx.objectStore(store);
        const k = await new Promise<IDBValidKey[]>((res) => (os.getAllKeys().onsuccess = (e) => res((e.target as IDBRequest).result)));
        const v = await new Promise<unknown[]>((res) => (os.getAll().onsuccess = (e) => res((e.target as IDBRequest).result)));
        keys.push(...k.map(String));
        text += JSON.stringify(v);
      }
      db.close();
      idbDump[info.name!] = { keys, text };
    }
    const cacheUrls: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const req of await cache.keys()) cacheUrls.push(req.url);
    }
    const cookies = document.cookie.split(';').map((c) => c.split('=')[0].trim()).filter(Boolean);
    return { cookies, local: localStorage.length, session: sessionStorage.length, idbDump, cacheUrls };
  });

  // the only thing that may be kept is the theme preference cookie
  expect(stored.cookies.filter((n) => n !== 'wisc3-theme')).toEqual([]);
  expect((await context.cookies()).map((c) => c.name).filter((n) => n !== 'wisc3-theme')).toEqual([]);
  expect(stored.local).toBe(0);
  expect(stored.session).toBe(0);
  expect(Object.keys(stored.idbDump)).toEqual(['wisc3-refdata']);
  for (const key of stored.idbDump['wisc3-refdata'].keys) expect(key === 'active' || key.startsWith('bundle:')).toBe(true);
  expect(stored.idbDump['wisc3-refdata'].text).not.toContain(BIRTH);
  expect(stored.cacheUrls.filter((u) => u.includes(BIRTH))).toEqual([]);

  const local = requests.filter((r) => new URL(r.url).hostname === 'localhost');
  expect(local.filter((r) => r.method !== 'GET')).toEqual([]);
  expect(local.filter((r) => new URL(r.url).search !== '')).toEqual([]);
  await context.close();
});
