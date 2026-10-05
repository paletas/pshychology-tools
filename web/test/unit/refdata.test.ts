import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain .mjs without types
import { buildBundle, canonical, sha256Hex } from '../../scripts/canonical.mjs';
import { initReferenceData, resolveBundleUrl, takePending } from '../../src/refdata/client';
import { dataDir } from '../shared/load';

const baselineBytes: Buffer = buildBundle(dataDir);
const baselineSha: string = sha256Hex(baselineBytes);

function variant(mutate: (b: any) => void): { bytes: Buffer; sha: string } {
  const obj = JSON.parse(baselineBytes.toString('utf8'));
  mutate(obj);
  const bytes = Buffer.from(canonical(obj), 'utf8');
  return { bytes, sha: sha256Hex(bytes) };
}

const bytesResponse = (b: Buffer) => new Response(new Uint8Array(b));
// Requests are matched by pathname (the client fetches relative URLs). Manifests carry the relative form the server sends.
const pathOf = (url: string) => new URL(url, document.baseURI).pathname;
const manifestFor = (sha: string, url: string, schemaVersion = 1) =>
  new Response(
    JSON.stringify({ schemaVersion, dataVersion: 'x', sha256: sha, bytes: 1, url: url.replace('/api/reference/', '') }),
  );
const manifestForAbsolute = (sha: string, url: string) =>
  new Response(JSON.stringify({ schemaVersion: 1, dataVersion: 'x', sha256: sha, bytes: 1, url }));

let routes: Record<string, () => Response | Promise<Response>>;
let fetchMock: ReturnType<typeof vi.fn>;
const setOnline = (v: boolean) => Object.defineProperty(navigator, 'onLine', { value: v, configurable: true });

async function idbEntries(): Promise<Record<string, unknown>> {
  const { openDB } = await import('idb');
  const db = await openDB('wisc3-refdata', 1);
  const keys = await db.getAllKeys('kv');
  const out: Record<string, unknown> = {};
  for (const k of keys) out[String(k)] = await db.get('kv', k);
  db.close();
  return out;
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  setOnline(true);
  routes = { '/reference/baseline.json': () => bytesResponse(baselineBytes) };
  fetchMock = vi.fn(async (url: string) => {
    const route = routes[pathOf(url)];
    if (!route) throw new Error(`unexpected fetch ${url}`);
    return route();
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const calls = (url: string) => fetchMock.mock.calls.filter((c) => pathOf(c[0]) === url).length;

describe('reference data client', () => {
  it('seeds an empty IDB from the baseline', async () => {
    setOnline(false);
    const h = await initReferenceData();
    await h.updated;
    expect(h.current?.sha).toBe(baselineSha);
    expect(h.current?.data.bands).toHaveLength(22);
    const entries = await idbEntries();
    expect(entries.active).toBe(baselineSha);
    expect(typeof entries[`bundle:${baselineSha}`]).toBe('string');
  });

  it('does not fetch a bundle when the manifest sha equals the active sha', async () => {
    routes['/api/reference/manifest'] = () => manifestFor(baselineSha, `/api/reference/bundle/${baselineSha}.json`);
    const h = await initReferenceData();
    await h.updated;
    expect(calls('/api/reference/manifest')).toBe(1);
    expect(calls(`/api/reference/bundle/${baselineSha}.json`)).toBe(0);
    expect(takePending()).toBeNull();
  });

  it('also accepts an absolute bundle url in the manifest', async () => {
    const next = variant((b) => { b.dataVersion = 'abs-version'; });
    const url = `/api/reference/bundle/${next.sha}.json`;
    routes['/api/reference/manifest'] = () => manifestForAbsolute(next.sha, url);
    routes[url] = () => bytesResponse(next.bytes);
    const h = await initReferenceData();
    await h.updated;
    expect(calls(url)).toBe(1);
    expect((await idbEntries()).active).toBe(next.sha);
  });

  it('stores a newer bundle, sets pending, and keeps current until takePending()', async () => {
    const next = variant((b) => { b.dataVersion = 'next-version'; });
    const url = `/api/reference/bundle/${next.sha}.json`;
    routes['/api/reference/manifest'] = () => manifestFor(next.sha, url);
    routes[url] = () => bytesResponse(next.bytes);
    const h = await initReferenceData();
    const seen: string[] = [];
    h.onPending((p) => seen.push(p.sha));
    await h.updated;
    expect(h.current?.sha).toBe(baselineSha);
    expect(seen).toEqual([next.sha]);
    const entries = await idbEntries();
    expect(entries.active).toBe(next.sha);
    expect(Object.keys(entries).sort()).toEqual(['active', `bundle:${next.sha}`].sort());
    const taken = takePending();
    expect(taken?.sha).toBe(next.sha);
    expect(taken?.data.dataVersion).toBe('next-version');
    expect(takePending()).toBeNull();
  });

  async function expectKept(manifest: () => Response, bundleUrl?: string, bundle?: () => Response | Promise<Response>) {
    routes['/api/reference/manifest'] = manifest;
    if (bundleUrl && bundle) routes[bundleUrl] = bundle;
    const h = await initReferenceData();
    await h.updated;
    expect(h.current?.sha).toBe(baselineSha);
    expect(takePending()).toBeNull();
    const entries = await idbEntries();
    expect(entries.active).toBe(baselineSha);
    expect(Object.keys(entries).sort()).toEqual(['active', `bundle:${baselineSha}`].sort());
  }

  it('keeps current on a hash mismatch', async () => {
    const next = variant((b) => { b.dataVersion = 'tampered'; });
    const url = `/api/reference/bundle/${next.sha}.json`;
    await expectKept(() => manifestFor('f'.repeat(64), url), url, () => bytesResponse(next.bytes));
  });

  it('keeps current on an invalid schema', async () => {
    const bad = variant((b) => { b.bands = b.bands.slice(0, 21); });
    const url = `/api/reference/bundle/${bad.sha}.json`;
    await expectKept(() => manifestFor(bad.sha, url), url, () => bytesResponse(bad.bytes));
  });

  it('keeps current when the bundle fetch rejects', async () => {
    const url = '/api/reference/bundle/abc.json';
    await expectKept(() => manifestFor('a'.repeat(64), url), url, () => { throw new Error('network'); });
  });

  it('keeps current when the manifest has schemaVersion 2', async () => {
    const url = '/api/reference/bundle/abc.json';
    await expectKept(() => manifestFor('a'.repeat(64), url, 2));
    expect(calls(url)).toBe(0);
  });

  it('does not fetch anything when offline', async () => {
    setOnline(false);
    const h = await initReferenceData();
    await h.updated;
    expect(calls('/api/reference/manifest')).toBe(0);
    expect(fetchMock.mock.calls.map((c) => pathOf(c[0]))).toEqual(['/reference/baseline.json']);
  });
});

describe('resolveBundleUrl', () => {
  it('resolves relative and absolute references against the page base', () => {
    history.pushState({}, '', '/new/wisc3');
    try {
      expect(resolveBundleUrl('api/reference/manifest', 'bundle/x.json')).toBe(`${location.origin}/new/api/reference/bundle/x.json`);
      expect(resolveBundleUrl('api/reference/manifest', '/api/reference/bundle/x.json')).toBe(`${location.origin}/api/reference/bundle/x.json`);
    } finally {
      history.pushState({}, '', '/');
    }
  });
});
