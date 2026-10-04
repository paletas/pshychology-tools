import type { Page } from '@playwright/test';
import { isAdUrl } from './adblock';

export interface ErrorLog {
  /** console.error texts and page errors that are not allowlisted */
  errors: string[];
  clear(): void;
}

/** Collects console.error and page errors of the NEW app; the only allowlist entry is ad net::ERR_* (the old app uses old-console.ts). */
export function collectErrors(page: Page): ErrorLog {
  const errors: string[] = [];
  const allowed = (text: string, url?: string): boolean => {
    if (/net::ERR_/.test(text) && (!url || isAdUrl(url))) return true;
    return false;
  };
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (!allowed(text, msg.location().url)) errors.push(`console: ${text}`);
  });
  page.on('pageerror', (err) => {
    const text = `${err.message}\n${err.stack ?? ''}`;
    if (!allowed(text)) errors.push(`pageerror: ${err.message}`);
  });
  return { errors, clear: () => void errors.splice(0, errors.length) };
}
