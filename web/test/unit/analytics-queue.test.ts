import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDB } from 'idb';
import { __resetClientForTests, __setConfigForTests, flushQueue, initAnalytics, isEnabled, track, trackPageview } from '../../src/analytics/client';
import { __resetQueueForTests, enqueue, peek } from '../../src/analytics/queue';
import { buildCalcStarted } from '../../src/analytics/events';

const setOnline = (v: boolean) => Object.defineProperty(navigator, 'onLine', { value: v, configurable: true });
const CFG = { websiteId: '11111111-1111-1111-1111-111111111111', endpoint: 'https://stats.example/api/send' };

let fetchMock: ReturnType<typeof vi.fn>;
const okResponse = () => ({ ok: true, status: 200, json: async () => ({}) });

function setHost(hostname: string) {
  vi.stubGlobal('location', { hostname, pathname: '/wisc3' });
}

async function allRecords(): Promise<any[]> {
  const db = await openDB('wisc3-events', 1);
  const recs = await db.getAll('events');
  db.close();
  return recs;
}
const settle = () => new Promise((r) => setTimeout(r, 50));
const bodies = () => fetchMock.mock.calls.map((c) => JSON.parse((c[1] as { body: string }).body));

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  await __resetQueueForTests();
  __resetClientForTests();
  setOnline(true);
  localStorage.clear();
  fetchMock = vi.fn(async () => okResponse());
  vi.stubGlobal('fetch', fetchMock);
  setHost('psy.itssilvestre.com');
  __setConfigForTests(CFG);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('analytics queue and gating', () => {
  it('offline enqueue', async () => {
    setOnline(false);
    fetchMock.mockRejectedValue(new Error('offline'));
    track(buildCalcStarted());
    await settle();
    const recs = await allRecords();
    expect(recs).toHaveLength(1);
    expect(Number.isInteger(recs[0].ts)).toBe(true);
    expect(recs[0].ts).toBeLessThan(Date.now() / 1000 + 1);
    expect(recs[0].ts).toBeGreaterThan(1_000_000_000);
    expect(recs[0].data.offline).toBe(true);
  });

  it('flush on online', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    track(buildCalcStarted());
    await settle();
    const [rec] = await allRecords();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith('config.json') ? { ok: true, json: async () => ({ analytics: CFG }) } : okResponse());
    await initAnalytics();
    await settle();
    window.dispatchEvent(new Event('online'));
    await settle();
    expect(await allRecords()).toHaveLength(0);
    const sent = fetchMock.mock.calls.filter((c) => c[0] === CFG.endpoint);
    expect(sent).toHaveLength(1);
    const body = JSON.parse((sent[0][1] as { body: string }).body);
    expect(body.type).toBe('event');
    expect(body.payload.timestamp).toBe(rec.ts);
    expect(body.payload.name).toBe('calc_started');
    expect(body.payload).not.toHaveProperty('screen');
    expect(body.payload).not.toHaveProperty('userAgent');
  });

  it('no duplicates on repeated flush', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await enqueue('calc_started', {});
    await enqueue('sheet_reset', {});
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => okResponse());
    await Promise.all([flushQueue(), flushQueue()]);
    await flushQueue();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await allRecords()).toHaveLength(0);
  });

  it('keeps record on non-2xx', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    track(buildCalcStarted());
    await settle();
    expect(await allRecords()).toHaveLength(1);
    await flushQueue();
    expect(await allRecords()).toHaveLength(1);
  });

  it('cap', async () => {
    __setConfigForTests(null); // keep everything queued
    // seed 500 records with distinct, ascending timestamps (same-second ties have no defined order), then push 5 more
    const base = Math.floor(Date.now() / 1000) - 1000;
    const seed = await openDB('wisc3-events', 1, { upgrade: (d) => d.createObjectStore('events', { keyPath: 'id' }).createIndex('ts', 'ts') });
    for (let i = 0; i < 500; i++) await seed.put('events', { id: `s${i}`, name: 'calc_started', data: { i: String(i) }, ts: base + i });
    seed.close();
    await __resetQueueForTests();
    for (let i = 500; i < 505; i++) await enqueue('calc_started', { i: String(i) });
    const recs = await allRecords();
    expect(recs).toHaveLength(500);
    // the oldest were pruned: the earliest survivors are not the first five inserted
    const kept = new Set(recs.map((r) => r.data.i));
    for (const i of ['0', '1', '2', '3', '4']) expect(kept.has(i)).toBe(false);
    expect(kept.has('5')).toBe(true);
    expect(kept.has('504')).toBe(true);

    // age pruning: a 31-day-old record is dropped on the next enqueue
    const db = await openDB('wisc3-events', 1);
    await db.put('events', { id: 'old', name: 'x', data: {}, ts: Math.floor(Date.now() / 1000) - 31 * 86400 });
    db.close();
    await enqueue('calc_started', {});
    expect((await allRecords()).some((r) => r.id === 'old')).toBe(false);
  }, 60_000);

  it('timestamp replay', async () => {
    const ts = Math.floor(Date.now() / 1000) - 3600;
    const db = await openDB('wisc3-events', 1, { upgrade: (d) => d.createObjectStore('events', { keyPath: 'id' }).createIndex('ts', 'ts') });
    await db.put('events', { id: 'a', name: 'calc_started', data: { offline: true }, ts });
    db.close();
    await flushQueue();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [b] = bodies();
    expect(b.payload.timestamp).toBe(ts);
    expect(b.payload.data.offline).toBe(true);
    expect(await allRecords()).toHaveLength(0);
  });

  it('no send without config', async () => {
    __setConfigForTests(null);
    expect(isEnabled()).toBe(false);
    track(buildCalcStarted());
    trackPageview();
    await settle();
    await flushQueue();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no send on a non-allow-listed host', async () => {
    for (const host of ['beta.itssilvestre.com', 'localhost']) {
      setHost(host);
      track(buildCalcStarted());
      await settle();
      await flushQueue();
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it('no send with umami.disabled', async () => {
    localStorage.setItem('umami.disabled', '1');
    track(buildCalcStarted());
    await settle();
    await flushQueue();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await peek()).toHaveLength(0);
  });
});
