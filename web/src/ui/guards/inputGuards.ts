import { dayCountAge, dayNumber } from '../../engine/age';
import { compareAge } from '../../engine/gate';
import type { Age, Snapshot } from '../../engine/types';
import { ptNew } from '../../i18n/pt-new';
import { fmt } from '../template';

// Pure input guards (REV-12). They sit in the UI layer, in front of the unchanged engine.

export type GuardLevel = 'info' | 'warn' | 'error';
export type GuardField = 'birth' | 'test';
export type DateState = 'dates-missing' | 'dates-invalid' | 'age-out' | 'ok';

export interface GuardMessage {
  key: string;
  level: GuardLevel;
  field: GuardField | 'both';
  params: Record<string, string>;
}

export interface DateGuard {
  state: DateState;
  messages: GuardMessage[];
  age: Age | null;
}

export interface DateGuardInput {
  birth: string;
  test: string;
  birthBad?: boolean;
  testBad?: boolean;
  /** Local date as YYYY-MM-DD. */
  today: string;
}

const MIN_AGE: Age = [6, 0, 0];
const MAX_AGE_EXCLUSIVE: Age = [17, 0, 0];

/** Local date as YYYY-MM-DD from an injectable clock. */
export function localToday(now: () => Date = () => new Date()): string {
  const d = now();
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getFullYear(), 4)}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Text of a guard message or results reason: the pt-new template with {age}, {n} and {names} filled in. */
export function guardText(key: string, params: Record<string, string> = {}): string {
  return (ptNew[key] ?? key).replace(/\{(\w+)\}/g, (_, k: string) => params[k] ?? '');
}

/** "9 anos, 3 meses e 12 dias" */
export function formatAgeParams(age: Age): { age: string } {
  return { age: fmt(ptNew['age.sentence'], age[0], age[1], age[2]) };
}

const isLeap = (y: number) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
const daysIn = (y: number, m: number) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

/** [y, m, d] when the text is a real calendar date the engine can read, otherwise null. */
function parse(iso: string): [number, number, number] | null {
  const m = /^(\d{1,4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1 || mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return null;
  return [y, mo, d];
}

const msg = (key: string, level: GuardLevel, field: GuardMessage['field'], params: Record<string, string> = {}): GuardMessage => ({ key, level, field, params });

export function dateGuard({ birth, test, birthBad = false, testBad = false, today }: DateGuardInput): DateGuard {
  // 1
  if (birth === '' && test === '' && !birthBad && !testBad) {
    return { state: 'dates-missing', messages: [msg('date.missing.both', 'info', 'both')], age: null };
  }
  // 2
  const b = birth === '' ? null : parse(birth);
  const t = test === '' ? null : parse(test);
  const badB = birthBad || (birth !== '' && !b);
  const badT = testBad || (test !== '' && !t);
  if (badB || badT) {
    const messages: GuardMessage[] = [];
    if (badB) messages.push(msg('date.invalid.birth', 'error', 'birth'));
    if (badT) messages.push(msg('date.invalid.test', 'error', 'test'));
    return { state: 'dates-invalid', messages, age: null };
  }
  // 3
  if (!b || !t) {
    return { state: 'dates-missing', messages: [msg(b ? 'date.missing.test' : 'date.missing.birth', 'info', b ? 'test' : 'birth')], age: null };
  }
  // 4, 5
  const bd = dayNumber(b[0], b[1], b[2]);
  const td = dayNumber(t[0], t[1], t[2]);
  if (td === bd) return { state: 'dates-invalid', messages: [msg('date.same', 'error', 'test')], age: null };
  if (td < bd) return { state: 'dates-invalid', messages: [msg('date.before', 'error', 'test')], age: null };
  // 6
  const age = dayCountAge(test, birth);
  if (!age) return { state: 'dates-invalid', messages: [msg('date.invalid.test', 'error', 'test')], age: null };
  const messages: GuardMessage[] = [];
  let state: DateState = 'ok';
  const params = formatAgeParams(age);
  if (b[0] < 1900 || age[0] >= 100) {
    state = 'age-out';
    messages.push(msg('age.implausible', 'error', 'birth', params));
  } else if (compareAge(age, MIN_AGE) < 0) {
    state = 'age-out';
    messages.push(msg('age.tooYoung', 'error', 'birth', params));
  } else if (compareAge(age, MAX_AGE_EXCLUSIVE) >= 0) {
    state = 'age-out';
    messages.push(msg('age.tooOld', 'error', 'birth', params));
  }
  // 7
  const tp = parse(today);
  if (tp && td > dayNumber(tp[0], tp[1], tp[2])) messages.push(msg('date.future', 'warn', 'test'));
  return { state, messages, age };
}

export interface RawParse {
  value: number | null;
  error: 'raw.invalid' | null;
}

/** Empty is not zero; only whole numbers >= 0 are accepted. */
export function parseRaw(text: string, badInput = false): RawParse {
  if (badInput) return { value: null, error: 'raw.invalid' };
  const s = text.trim();
  if (s === '') return { value: null, error: null };
  if (/^\d+$/.test(s)) return { value: parseInt(s, 10), error: null };
  return { value: null, error: 'raw.invalid' };
}

export interface ResultsReason {
  key: 'results.empty.dates' | 'results.empty.age' | 'results.empty.invalidRaw' | 'results.empty.mandatory';
  params: Record<string, string>;
}

/**
 * Why the results are not shown, or null when they are.
 * @param names test id -> display name (only used in the message), mandatory flag per id
 */
export function resultsReason(
  dateState: DateState,
  snapshot: Snapshot,
  rawErrors: Record<string, string | null>,
  tests: { id: string; name: string; mandatory: boolean }[],
): ResultsReason | null {
  if (dateState === 'dates-missing' || dateState === 'dates-invalid') return { key: 'results.empty.dates', params: {} };
  if (dateState === 'age-out') return { key: 'results.empty.age', params: {} };
  const mandatory = tests.filter((t) => t.mandatory);
  const bad = mandatory.filter((t) => rawErrors[t.id] || snapshot.tests[t.id]?.outOfBounds);
  if (bad.length) return { key: 'results.empty.invalidRaw', params: { names: bad.map((t) => t.name).join(', ') } };
  const missing = mandatory.filter((t) => !snapshot.tests[t.id]?.ok);
  if (missing.length) return { key: 'results.empty.mandatory', params: { n: String(missing.length), names: missing.map((t) => t.name).join(', ') } };
  return null;
}
