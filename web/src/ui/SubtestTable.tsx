import type { Column, RefData, Snapshot, TestDef } from '../engine/types';
import { pt } from '../i18n/pt';
import { ptNew } from '../i18n/pt-new';
import { guardText } from './guards/inputGuards';
import { fmt } from './template';

interface Props {
  data: RefData;
  snapshot: Snapshot;
  /** The text of each raw-score field, as typed (REV-12: validated by parseRaw in the parent). */
  rawText: Record<string, string>;
  /** parseRaw error key per test (null when the text is empty or valid). */
  rawErrors: Record<string, string | null>;
  onRawText: (testId: string, text: string) => void;
}

/** Keys that can never be part of a whole number >= 0. The decimal separators stay allowed so that 12.5 is reported, not silently cut. */
const BLOCKED_KEYS = new Set(['-', '+', 'e', 'E']);

const FACTORS: Partial<Record<Column, string>> = {
  verbalComprehension: pt['TestsPatternResults.VerbalComprehension'],
  perceptiveOrganization: pt['TestsPatternResults.PerceptiveOrganization'],
  processingVelocity: pt['TestsPatternResults.ProcessingVelocity'],
};

const SUM_LABELS: [string, string][] = [
  ['verbal', pt['TestsPatternResults.Verbal.MouseHover']],
  ['realization', pt['TestsPatternResults.Realization.MouseHover']],
  ['complete', pt['QI.CompleteScale']],
  ['verbalComprehension', pt['TestsPatternResults.VerbalComprehension.MouseHover']],
  ['perceptiveOrganization', pt['TestsPatternResults.PerceptiveOrganization.MouseHover']],
  ['processingVelocity', pt['TestsPatternResults.ProcessingVelocity.MouseHover']],
];

/** Group (Verbal or Realização) and, when the test belongs to one, its factor, e.g. "Verbal · CV". */
function tag(t: TestDef): string {
  const group = t.columns.includes('verbal') ? pt['TestsPatternResults.Verbal.MouseHover'] : pt['TestsPatternResults.Realization.MouseHover'];
  const factor = t.columns.map((c) => FACTORS[c]).find(Boolean);
  return factor ? `${group} · ${factor}` : group;
}

/** The subtests in administration order (the order of data.tests), then the sums. */
export function SubtestTable({ data, snapshot, rawText, rawErrors, onRawText }: Props) {
  return (
    <>
      <h2>{pt['TestsDescription']}</h2>
      <ul className="tests">
        {data.tests.map((t) => {
          const s = snapshot.tests[t.id];
          const name = pt[`Test.${t.id}`];
          const value = s.scaled.find((v) => v !== null) ?? null;
          const msgId = `oob-msg-${t.id}`;
          const rawMsgId = `raw-msg-${t.id}`;
          const rawError = rawErrors[t.id] ?? null;
          const describedBy = [rawError ? rawMsgId : null, s.outOfBounds ? msgId : null].filter(Boolean).join(' ') || undefined;
          return (
            <li key={t.id} className={s.outOfBounds || rawError ? 'bad' : undefined} data-testid={`subtest-row-${t.id}`}>
              <span className="t-name">
                <b>
                  {name}
                  {!t.mandatory && <> <span className="opt">{ptNew['optional']}</span></>}
                </b>
                <small>{tag(t)}</small>
              </span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                data-testid={`raw-${t.id}`}
                aria-label={fmt(ptNew['raw.aria'], name)}
                aria-invalid={s.outOfBounds || rawError ? true : undefined}
                aria-describedby={describedBy}
                value={rawText[t.id] ?? ''}
                onKeyDown={(e) => {
                  if (!e.ctrlKey && !e.metaKey && !e.altKey && BLOCKED_KEYS.has(e.key)) e.preventDefault();
                }}
                onChange={(e) => onRawText(t.id, e.target.value)}
                onInput={(e) => onRawText(t.id, (e.target as HTMLInputElement).value)}
                onPaste={(e) => {
                  // validate the pasted text as it will read, so a bad paste shows the message at once
                  const el = e.currentTarget;
                  const pasted = e.clipboardData.getData('text');
                  const next = el.value.slice(0, el.selectionStart ?? 0) + pasted + el.value.slice(el.selectionEnd ?? 0);
                  e.preventDefault();
                  onRawText(t.id, next);
                }}
              />
              <span
                className={value === null ? 'scaled empty' : 'scaled'}
                data-testid={`scaled-${t.id}`}
                data-columns={t.columns.join(',')}
                aria-label={ptNew['scaled.aria']}
              >
                {value ?? ''}
              </span>
              {rawError && (
                <span className="msg" id={rawMsgId} data-testid={`raw-msg-${t.id}`} data-key={rawError} role="alert">
                  {guardText(rawError)}
                </span>
              )}
              {s.outOfBounds && (
                <span className="msg" id={msgId} data-testid={`oob-${t.id}`}>
                  {fmt(pt['TestsPatternResults.Error.OutOfBounds'], s.min ?? '', s.max ?? '')}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <h3 className="sums-title">{pt['Test.SumResults']}</h3>
      <div className="sums">
        {SUM_LABELS.map(([key, label]) => (
          <div key={key}>
            <b data-testid={`sum-${key}`}>{snapshot.sums[key as keyof typeof snapshot.sums]}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </>
  );
}

