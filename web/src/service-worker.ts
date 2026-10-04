import { setCacheNameDetails } from 'workbox-core';
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { ExpirationPlugin } from 'workbox-expiration';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate } from 'workbox-strategies';

// Minimal typing of the worker scope (the app tsconfig uses the DOM lib).
interface WorkerEvent {
  waitUntil(p: Promise<unknown>): void;
  data?: { type?: string };
}
declare global {
  interface Window {
    __WB_MANIFEST: Array<string | { url: string; revision: string | null }>;
  }
}
const sw = self as unknown as {
  location: Location;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  addEventListener(type: string, listener: (e: WorkerEvent) => void): void;
};

const META_CACHE = 'wisc3-meta';

setCacheNameDetails({ prefix: 'wisc3' });
precacheAndRoute(self.__WB_MANIFEST);

// Offline app shell for / and /wisc3 only; cross-origin and unknown same-origin requests pass through.
registerRoute(
  ({ request, url }) =>
    request.mode === 'navigate' && url.origin === sw.location.origin && (url.pathname === '/' || url.pathname === '/wisc3'),
  createHandlerBoundToURL('/index.html'),
);

// Runtime config for the "Versão anterior" link: same-origin /config.json only, stale-while-revalidate, one entry.
// Navigation is never intercepted by this route.
registerRoute(
  ({ request, url }) => request.mode !== 'navigate' && url.origin === sw.location.origin && url.pathname === '/config.json',
  new StaleWhileRevalidate({ cacheName: 'wisc3-config', plugins: [new ExpirationPlugin({ maxEntries: 1 })] }),
);

// First install (no meta cache yet, e.g. replacing the old stub) takes over at once; later updates wait for the user.
sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches.has(META_CACHE).then((has) => {
      if (!has) return sw.skipWaiting();
    }),
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const first = !(await caches.has(META_CACHE));
      await caches.open(META_CACHE);
      for (const name of await caches.keys()) if (!name.startsWith('wisc3-')) await caches.delete(name);
      if (first) await sw.clients.claim();
    })(),
  );
});

sw.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void sw.skipWaiting();
});
