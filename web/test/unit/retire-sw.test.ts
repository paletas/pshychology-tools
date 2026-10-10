import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repoRoot } from '../shared/load';

// web/public/retire-service-worker.js runs against a fake worker global: `self` and `caches` are the Function parameters.
const src = readFileSync(resolve(repoRoot, 'web/public/retire-service-worker.js'), 'utf8');
const O = 'https://psy.example';

interface FakeEvent {
  waitUntil(p: Promise<unknown>): void;
}

function load(scope: string, cacheNames: string[], clientUrls: string[], failingUrls: string[] = []) {
  const listeners = new Map<string, (e: FakeEvent) => void>();
  const deleted: string[] = [];
  const navigated: string[] = [];
  const calls = { skipWaiting: 0, claim: 0, unregister: 0 };
  const fakeSelf = {
    registration: {
      scope,
      unregister: async () => {
        calls.unregister++;
        return true;
      },
    },
    skipWaiting: async () => {
      calls.skipWaiting++;
    },
    clients: {
      claim: async () => {
        calls.claim++;
      },
      matchAll: async () =>
        clientUrls.map((url) => ({
          url,
          navigate: async (to: string) => {
            if (failingUrls.includes(url)) throw new Error('navigate failed');
            navigated.push(`${url} -> ${to}`);
            return null;
          },
        })),
    },
    addEventListener: (type: string, l: (e: FakeEvent) => void) => {
      listeners.set(type, l);
    },
  };
  const fakeCaches = {
    keys: async () => [...cacheNames],
    delete: async (name: string) => {
      deleted.push(name);
      return true;
    },
  };
  new Function('self', 'caches', src)(fakeSelf, fakeCaches);
  async function fire(type: string): Promise<void> {
    const pending: Promise<unknown>[] = [];
    listeners.get(type)?.({ waitUntil: (p) => pending.push(p) });
    await Promise.all(pending);
  }
  return { listeners, deleted, navigated, calls, fire };
}

const CACHES = [
  `wisc3-meta-${O}/new/`,
  `wisc3-config-${O}/new/`,
  `wisc3-precache-v2-${O}/new/`,
  `wisc3-meta-${O}/`,
  `wisc3-precache-v2-${O}/`,
  'blazor-resources-/',
];

describe('retire service worker (web/public/retire-service-worker.js)', () => {
  it('starts with the marker and has no imports and no fetch handler', () => {
    expect(src.split(/\r?\n/)[0]).toBe('// wisc3-retire');
    expect(src).not.toMatch(/importScripts|workbox|['"]fetch['"]|^\s*(import|export)\s/im);
  });

  it('at scope /new/ takes over, deletes only the /new/ wisc3 caches, unregisters and moves /new windows to /wisc3', async () => {
    const w = load(`${O}/new/`, CACHES, [`${O}/new/wisc3`, `${O}/wisc3`]);
    expect([...w.listeners.keys()].sort()).toEqual(['activate', 'install']);
    await w.fire('install');
    expect(w.calls.skipWaiting).toBe(1);
    await w.fire('activate');
    expect(w.calls.claim).toBe(1);
    expect([...w.deleted].sort()).toEqual([`wisc3-config-${O}/new/`, `wisc3-meta-${O}/new/`, `wisc3-precache-v2-${O}/new/`]);
    expect(w.calls.unregister).toBe(1);
    expect(w.navigated).toEqual([`${O}/new/wisc3 -> ${O}/wisc3`]);
  });

  it.each([`${O}/`, `${O}/other/`])('at scope %s does nothing', async (scope) => {
    const w = load(scope, CACHES, [`${O}/wisc3`, `${O}/new/wisc3`]);
    await w.fire('install');
    await w.fire('activate');
    expect(w.calls).toEqual({ skipWaiting: 0, claim: 0, unregister: 0 });
    expect(w.deleted).toEqual([]);
    expect(w.navigated).toEqual([]);
  });

  it('a window that cannot be navigated does not stop the others', async () => {
    const w = load(`${O}/new/`, CACHES, [`${O}/new/wisc3`, `${O}/new/`], [`${O}/new/wisc3`]);
    await w.fire('install');
    await w.fire('activate');
    expect(w.navigated).toEqual([`${O}/new/ -> ${O}/wisc3`]);
  });
});