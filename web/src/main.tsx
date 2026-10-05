import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Workbox } from 'workbox-window';
import { App } from './App';
import type { SwUpdate } from './App';
import { installDebug } from './debug';
import './index.css';

installDebug();

let swUpdate: SwUpdate | undefined;
if ('serviceWorker' in navigator) {
  const wb = new Workbox('service-worker.js');
  const listeners: Array<() => void> = [];
  let waiting = false;
  let reloadRequested = false;
  wb.addEventListener('waiting', () => {
    waiting = true;
    listeners.forEach((l) => l());
  });
  wb.addEventListener('controlling', () => {
    // only after the user asked for the update; never reload automatically otherwise
    if (reloadRequested) location.reload();
  });
  swUpdate = {
    subscribe(cb) {
      listeners.push(cb);
      if (waiting) cb();
    },
    apply() {
      reloadRequested = true;
      wb.messageSkipWaiting();
    },
  };
  wb.register().catch((err) => console.warn('service worker registration failed', err));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App swUpdate={swUpdate} />
  </StrictMode>,
);
