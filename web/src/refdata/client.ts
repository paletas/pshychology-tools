import type { RefData } from '../engine/types';
import { parseBundle, SCHEMA_VERSION } from './schema';
import { deleteBundle, openStore, readActive, writeActive } from './store';
import type { RefStore } from './store';

const BASELINE_URL = 'reference/baseline.json';
const MANIFEST_URL = 'api/reference/manifest';
const TIMEOUT_MS = 10_000;

/** Resolves a bundle URL from the manifest (relative or absolute) against the manifest URL and the page base. */
export function resolveBundleUrl(manifestUrl: string, bundleUrl: string): string {
  return new URL(bundleUrl, new URL(manifestUrl, document.baseURI)).href;
}

export interface Loaded {
  data: RefData;
  sha: string;
}

export interface ReferenceDataHandle {
  /** The reference data in use, or null when nothing is available at all. */
  current: Loaded | null;
  /** Calls back once a newer bundle has been stored (immediately if it already was). */
  onPending(cb: (pending: Loaded) => void): void;
  /** Resolves when the background update check has finished (it never rejects). */
  updated: Promise<void>;
}

let current: Loaded | null = null;
let pending: Loaded | null = null;
let listeners: Array<(pending: Loaded) => void> = [];

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) throw new Error(`${url} -> HTTP ${resp.status}`);
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBundle(url: string): Promise<{ sha: string; text: string }> {
  const bytes = await (await fetchWithTimeout(url)).arrayBuffer();
  return { sha: await sha256Hex(bytes), text: new TextDecoder().decode(bytes) };
}

async function loadActive(db: RefStore): Promise<Loaded | null> {
  try {
    const stored = await readActive(db);
    if (stored) return { data: parseBundle(stored.text), sha: stored.sha };
  } catch (err) {
    console.warn('stored reference data unusable', err);
  }
  try {
    const baseline = await fetchBundle(BASELINE_URL);
    const data = parseBundle(baseline.text);
    await writeActive(db, baseline.sha, baseline.text);
    return { data, sha: baseline.sha };
  } catch (err) {
    console.warn('baseline reference data unavailable', err);
    return null;
  }
}

async function checkForUpdate(db: RefStore, active: string | null): Promise<void> {
  if (!navigator.onLine) return;
  try {
    const manifest = (await (await fetchWithTimeout(MANIFEST_URL)).json()) as {
      schemaVersion: number;
      sha256: string;
      url: string;
    };
    if (manifest.schemaVersion !== SCHEMA_VERSION || manifest.sha256 === active) return;
    const bundle = await fetchBundle(resolveBundleUrl(MANIFEST_URL, manifest.url));
    if (bundle.sha !== manifest.sha256) throw new Error('bundle hash mismatch');
    const data = parseBundle(bundle.text);
    await writeActive(db, bundle.sha, bundle.text);
    if (active) await deleteBundle(db, active);
    pending = { data, sha: bundle.sha };
    for (const cb of listeners) cb(pending);
  } catch (err) {
    console.warn('reference data update failed', err);
  }
}

export async function initReferenceData(): Promise<ReferenceDataHandle> {
  pending = null;
  listeners = [];
  let db: RefStore | null = null;
  try {
    db = await openStore();
  } catch (err) {
    console.warn('reference data storage unavailable', err);
  }
  if (db) {
    current = await loadActive(db);
  } else {
    current = await fetchBundle(BASELINE_URL)
      .then((b) => ({ data: parseBundle(b.text), sha: b.sha }))
      .catch(() => null);
  }
  const store = db;
  const updated = store ? checkForUpdate(store, current?.sha ?? null) : Promise.resolve();
  return {
    current,
    onPending(cb) {
      listeners.push(cb);
      if (pending) cb(pending);
    },
    updated,
  };
}

/** Promotes a pending bundle to current (app start or "Começar Novo"). Returns it, or null if none. */
export function takePending(): Loaded | null {
  if (!pending) return null;
  current = pending;
  pending = null;
  return current;
}
