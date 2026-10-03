import type { Page } from '@playwright/test';
import { isAdUrl } from './adblock';

export interface ConsoleOptions {
  /** old app only: allowlist (a), the null-chart TypeError from wisc3.js */
  oldNullChart?: boolean;
  /** old app only: allowlist (b), Blazor unhandled-exception lines; enable per case only when the prediction throws (age or raw stage) */
  oldThrows?: boolean;
}

const NULL_CHART = /Cannot read propert(y|ies) of null/;
const BLAZOR_THROW = /Unhandled exception rendering component|ArgumentOutOfRangeException|blazor\.web\.js/;

export interface ErrorLog {
  /** console.error texts and page errors that are not allowlisted */
  errors: string[];
  clear(): void;
}

/** Collects console.error and page errors, applying the allowlists from the plan. */
export function collectErrors(page: Page, opts: ConsoleOptions = {}): ErrorLog {
  const errors: string[] = [];
  const allowed = (text: string, url?: string): boolean => {
    if (/net::ERR_/.test(text) && (!url || isAdUrl(url))) return true;
    if (opts.oldNullChart && NULL_CHART.test(text)) return true;
    if (opts.oldThrows && BLAZOR_THROW.test(text)) return true;
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
