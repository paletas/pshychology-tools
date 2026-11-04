// Closed vocabulary for analytics events. Pure: every value that leaves the app is an enum string or a boolean,
// never free text, numbers or anything derived from the sheet.

export type EventName =
  | 'calc_started'
  | 'results_shown'
  | 'sheet_left'
  | 'print'
  | 'lookup_opened'
  | 'ci_changed'
  | 'legacy_clicked'
  | 'sheet_reset'
  | 'app_installed'
  | 'offline_session'
  | 'refdata_failed'
  | 'update_available'
  | 'update_applied'
  | 'client_error';

export type EventData = Record<string, string | boolean>;
export type BuiltEvent = { name: EventName; data: EventData };

export type DurationBucket = '<1m' | '1-3m' | '3-10m' | '10-30m' | '>30m';
export const DURATION_BUCKETS: readonly DurationBucket[] = ['<1m', '1-3m', '3-10m', '10-30m', '>30m'];

export function durationBucket(ms: number): DurationBucket {
  const m = Number.isFinite(ms) ? ms / 60000 : 0;
  if (m < 1) return '<1m';
  if (m < 3) return '1-3m';
  if (m < 10) return '3-10m';
  if (m < 30) return '10-30m';
  return '>30m';
}

export type OptionalSubtest = 'SymbolSearch' | 'DigitMemory' | 'Labyrinth' | 'other';
export const OPTIONAL_SUBTESTS: readonly OptionalSubtest[] = ['SymbolSearch', 'DigitMemory', 'Labyrinth', 'other'];

export function toOptionalSubtest(id: unknown): OptionalSubtest {
  return id === 'SymbolSearch' || id === 'DigitMemory' || id === 'Labyrinth' ? id : 'other';
}

export type BlockedBy = 'dates' | 'age' | 'invalid_raw' | 'mandatory' | 'other';
export const BLOCKED_BY: readonly BlockedBy[] = ['dates', 'age', 'invalid_raw', 'mandatory', 'other'];

export function toBlockedBy(reasonKey: unknown): BlockedBy {
  switch (reasonKey) {
    case 'results.empty.dates':
      return 'dates';
    case 'results.empty.age':
      return 'age';
    case 'results.empty.invalidRaw':
      return 'invalid_raw';
    case 'results.empty.mandatory':
      return 'mandatory';
    default:
      return 'other';
  }
}

export type Outcome = 'results' | 'blocked' | 'partial';
export const OUTCOMES: readonly Outcome[] = ['results', 'blocked', 'partial'];
export type PrintVia = 'button' | 'beforeprint';
export const PRINT_VIA: readonly PrintVia[] = ['button', 'beforeprint'];
export type CiLevel = '90' | '95' | '99' | 'other';
export const CI_LEVELS: readonly CiLevel[] = ['90', '95', '99', 'other'];
export type ErrorKind = 'error' | 'unhandledrejection' | 'react';
export const ERROR_KINDS: readonly ErrorKind[] = ['error', 'unhandledrejection', 'react'];
export const ERROR_NAMES: readonly string[] = [
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'ReferenceError',
  'EvalError',
  'URIError',
  'DOMException',
  'AggregateError',
];

const ev = (name: EventName, data: EventData = {}): BuiltEvent => ({ name, data });

export const buildCalcStarted = () => ev('calc_started');

export function buildResultsShown(durationMs: number, optional: unknown[]) {
  const ids = [...new Set((Array.isArray(optional) ? optional : []).map(toOptionalSubtest))].sort();
  return ev('results_shown', { duration_bucket: durationBucket(durationMs), optional: ids.length ? ids.join(',') : 'none' });
}

export function buildSheetLeft(outcome: Outcome, reasonKey?: unknown) {
  const o: Outcome = OUTCOMES.includes(outcome) ? outcome : 'partial';
  return ev('sheet_left', { outcome: o, blocked_by: o === 'blocked' ? toBlockedBy(reasonKey) : 'none' });
}

export function buildPrint(via: PrintVia, hadResults: boolean) {
  return ev('print', { via: via === 'beforeprint' ? 'beforeprint' : 'button', had_results: hadResults === true });
}

export const buildLookupOpened = () => ev('lookup_opened');

export function buildCiChanged(level: unknown) {
  const s = String(level);
  return ev('ci_changed', { level: s === '90' || s === '95' || s === '99' ? s : 'other' });
}

export const buildLegacyClicked = () => ev('legacy_clicked');
export const buildSheetReset = () => ev('sheet_reset');
export const buildAppInstalled = () => ev('app_installed');
export const buildOfflineSession = () => ev('offline_session');
export const buildRefdataFailed = () => ev('refdata_failed');

export const buildUpdate = (kind: 'available' | 'applied') => ev(kind === 'applied' ? 'update_applied' : 'update_available');

export function buildClientError(kind: ErrorKind, name: unknown, where: string) {
  const k: ErrorKind = ERROR_KINDS.includes(kind) ? kind : 'error';
  const raw = typeof name === 'string' ? name : name instanceof Error ? name.name : '';
  const n = ERROR_NAMES.includes(raw) ? raw : 'other';
  const w = typeof where === 'string' && /^[A-Za-z0-9._-]+:\d+$/.test(where) ? where : 'external';
  return ev('client_error', { kind: k, name: n, where: w });
}

/** Every builder, for the privacy test to iterate. */
export const EVENT_BUILDERS = {
  buildCalcStarted,
  buildResultsShown,
  buildSheetLeft,
  buildPrint,
  buildLookupOpened,
  buildCiChanged,
  buildLegacyClicked,
  buildSheetReset,
  buildAppInstalled,
  buildOfflineSession,
  buildRefdataFailed,
  buildUpdate,
  buildClientError,
} as const;
