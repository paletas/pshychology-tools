// wisc3-retire
// Retire worker for the phase-1 /new install of the WISC-III app (2.1.0 and later).
// Traefik router psytoolsretire serves this file at /new/service-worker.js only; the root keeps the real worker.
// At scope /new/ it takes over at once, deletes the wisc3-* caches of its own scope, unregisters itself and sends
// open /new windows to the root app (/wisc3). At any other scope it does nothing.
'use strict';

const scope = self.registration.scope;
const active = new URL(scope).pathname === '/new/';
const target = new URL('/wisc3', scope).href;

self.addEventListener('install', (event) => {
  if (active) event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  if (!active) return;
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      for (const name of await caches.keys()) {
        if (name.startsWith('wisc3-') && name.endsWith(scope)) await caches.delete(name);
      }
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: 'window' })) {
        if (!client.url.startsWith(scope)) continue;
        try {
          await client.navigate(target);
        } catch {
          // this window keeps its page; its next load is no longer controlled here
        }
      }
    })(),
  );
});