import type { BuiltEvent } from './events';
import { enqueue, flush } from './queue';
import type { QueuedEvent } from './queue';

// Analytics client: queues enum-built events and posts them to the Umami /api/send endpoint.
// Never imports the app or the debug module; nothing here may throw into the caller.
type Config = { websiteId: string; endpoint: string };

const ALLOWED_HOST = 'psy.itssilvestre.com';
const PAGEVIEW = 'pageview';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let cfg: Config | null = null;
let dataVersion = 'unknown';
let listening = false;

export function setDataVersion(v: unknown): void {
  dataVersion = typeof v === 'string' && /^[A-Za-z0-9._-]{1,40}$/.test(v) ? v : 'unknown';
}

function validConfig(a: unknown): Config | null {
  if (!a || typeof a !== 'object') return null;
  const { websiteId, endpoint } = a as { websiteId?: unknown; endpoint?: unknown };
  if (typeof websiteId !== 'string' || !UUID.test(websiteId) || typeof endpoint !== 'string') return null;
  try {
    return new URL(endpoint).protocol === 'https:' ? { websiteId, endpoint } : null;
  } catch {
    return null;
  }
}

export function isEnabled(): boolean {
  try {
    return cfg !== null && location.hostname === ALLOWED_HOST && localStorage.getItem('umami.disabled') === null;
  } catch {
    return false;
  }
}

function displayMode(): 'standalone' | 'browser' {
  try {
    return matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser';
  } catch {
    return 'browser';
  }
}

async function send(e: QueuedEvent): Promise<boolean> {
  if (!isEnabled() || !cfg) return false;
  try {
    const isPageview = e.name === PAGEVIEW;
    const payload: Record<string, unknown> = {
      website: cfg.websiteId,
      hostname: location.hostname,
      url: location.pathname.startsWith('/new') ? '/new/wisc3' : '/wisc3',
      title: 'WISC-III',
      language: 'pt',
      data: { ...e.data, app_version: __APP_VERSION__, data_version: dataVersion, display_mode: displayMode() },
      timestamp: e.ts,
    };
    if (isPageview) {
      let referrer = '';
      try {
        referrer = document.referrer ? new URL(document.referrer).origin : '';
      } catch {
        referrer = '';
      }
      payload.referrer = referrer;
    } else {
      payload.name = e.name;
    }
    const res = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'event', payload }),
      keepalive: true,
      credentials: 'omit',
    });
    return res.ok;
  } catch {
    return false;
  }
}

// disabled (wrong host, no config, opt-out): never open the queue database, so nothing is created in the browser
export const flushQueue = (): Promise<void> => (isEnabled() ? flush(send).catch(() => {}) : Promise.resolve());
const doFlush = flushQueue;

export async function initAnalytics(): Promise<void> {
  try {
    const res = await fetch('config.json');
    const c = res.ok ? ((await res.json()) as { analytics?: unknown } | null) : null;
    cfg = validConfig(c?.analytics);
  } catch {
    cfg = null;
  }
  if (!listening) {
    listening = true;
    window.addEventListener('online', () => void doFlush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void doFlush();
    });
    window.addEventListener('pagehide', () => void doFlush());
  }
  await doFlush();
}

async function queue(name: string, data: BuiltEvent['data']): Promise<void> {
  if (!isEnabled()) return;
  // `offline` is evaluated now so replayed events keep the state they were recorded in
  await enqueue(name, { ...data, offline: !navigator.onLine });
  await doFlush();
}

export function track(event: BuiltEvent): void {
  void queue(event.name, event.data).catch(() => {});
}

export function trackPageview(): void {
  void queue(PAGEVIEW, {}).catch(() => {});
}

export function __setConfigForTests(c: Config | null): void {
  cfg = c;
}

export function __resetClientForTests(): void {
  cfg = null;
  dataVersion = 'unknown';
}
