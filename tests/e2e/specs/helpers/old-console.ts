import type { Page } from '@playwright/test';
import { isAdUrl } from './adblock';

/** One console exception the oracle predicts for the old app (oracle OldConsole.cs). */
export interface PredictedOldConsole {
  kind: OldConsoleKind;
  stage: string;
  test?: string | null;
  raw?: number | null;
}

export type OldConsoleKind = 'age-throw' | 'raw-throw' | 'visualizer-raw-throw' | 'visualizer-index-throw';
export type OldClass = OldConsoleKind | 'null-chart' | 'ad' | 'unclassified';

export const OLD_CONSOLE_KINDS: OldConsoleKind[] = ['age-throw', 'raw-throw', 'visualizer-raw-throw', 'visualizer-index-throw'];

export interface OldCaseCtx {
  oldConsole: PredictedOldConsole[];
}

/**
 * Classifies one observed old-app console record (plan Design table, first matching rule wins).
 * `url` is the message location url (ad rule only; unknown url counts as an ad host like the new-app allowlist).
 */
export function classifyOld(text: string, ctx: OldCaseCtx, url?: string): OldClass {
  const vizRaw = ctx.oldConsole.find((c) => c.kind === 'visualizer-raw-throw');
  if (
    vizRaw?.raw != null &&
    text.includes('ArgumentOutOfRangeException') &&
    text.includes('WISC3LookupTableVisualizer') &&
    text.includes(`'${vizRaw.raw}' is outside of the supported values`)
  ) return 'visualizer-raw-throw';
  if (text.includes('IndexOutOfRangeException') && text.includes('WISC3LookupTableVisualizer')) return 'visualizer-index-throw';
  if (text.includes('Age provided is outside of supported range') && text.includes('set_SubjectAge')) return 'age-throw';
  if (text.includes('is outside of the supported values') && text.includes('set_RawResult') && !text.includes('WISC3LookupTableVisualizer')) return 'raw-throw';
  if (/Cannot read propert(y|ies) of null/.test(text) && text.includes('wisc3.js')) return 'null-chart';
  if (/net::ERR_/.test(text) && (!url || isAdUrl(url))) return 'ad';
  return 'unclassified';
}

export interface OldRecord {
  /** ms timestamp */
  t: number;
  text: string;
  url?: string;
}

export interface OldConsoleLog {
  records: OldRecord[];
  clear(): void;
}

/** Collects every old-app console message of type error, or whose text starts with crit: / fail:, and every page error. */
export function collectOldConsole(page: Page): OldConsoleLog {
  const records: OldRecord[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() !== 'error' && !/^(crit|fail):/.test(text)) return;
    records.push({ t: Date.now(), text, url: msg.location().url });
  });
  page.on('pageerror', (err) => {
    records.push({ t: Date.now(), text: `${err.message}\n${err.stack ?? ''}` });
  });
  return { records, clear: () => void records.splice(0, records.length) };
}

export interface OldConsoleResult {
  predicted: OldConsoleKind[];
  /** classified kinds seen (presence, not count) */
  observed: OldConsoleKind[];
  /** records no rule matched (each one is a regression) */
  unclassified: string[];
}

export function evaluateOldConsole(records: OldRecord[], ctx: OldCaseCtx): OldConsoleResult {
  const observed = new Set<OldConsoleKind>();
  const unclassified: string[] = [];
  for (const r of records) {
    const k = classifyOld(r.text, ctx, r.url);
    if (k === 'unclassified') unclassified.push(r.text);
    else if (OLD_CONSOLE_KINDS.includes(k as OldConsoleKind)) observed.add(k as OldConsoleKind);
  }
  return {
    predicted: [...new Set(ctx.oldConsole.map((c) => c.kind))],
    observed: [...observed],
    unclassified,
  };
}
