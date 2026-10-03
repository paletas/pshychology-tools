import type { Column, RefData, Snapshot, TestDef } from '../engine/types';
import { pt } from '../i18n/pt';
import { ptNew } from '../i18n/pt-new';
import { fmt } from './template';

interface Props {
  data: RefData;
  snapshot: Snapshot;
  raw: Record<string, number | null>;
  onRaw: (testId: string, value: number | null) => void;
}

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
export function SubtestTable({ data, snapshot, raw, onRaw }: Props) {
  const change = (testId: string, text: string) => {
    if (text === '') return onRaw(testId, null);
    const n = Number(text);
    if (Number.isInteger(n)) onRaw(testId, n);
  };
  return (
    <>
      <h2>{pt['TestsDescription']}</h2>
      <ul className="tests">
        {data.tests.map((t) => {
          const s = snapshot.tests[t.id];
          const r = raw[t.id] ?? null;
          const name = pt[`Test.${t.id}`];
          const value = s.scaled.find((v) => v !== null) ?? null;
          const msgId = `oob-msg-${t.id}`;
          return (
            <li key={t.id} className={s.outOfBounds ? 'bad' : undefined} data-testid={`subtest-row-${t.id}`}>
              <span className="t-name">
                <b>
                  {name}
                  {!t.mandatory && <> <span className="opt">{ptNew['optional']}</span></>}
                </b>
                <small>{tag(t)}</small>
              </span>
              <input
                type="number"
                inputMode="numeric"
                data-testid={`raw-${t.id}`}
                aria-label={fmt(ptNew['raw.aria'], name)}
                aria-invalid={s.outOfBounds || undefined}
                aria-describedby={s.outOfBounds ? msgId : undefined}
                value={r ?? ''}
                min={s.min ?? undefined}
                max={s.max ?? undefined}
                onChange={(e) => change(t.id, e.target.value)}
                onInput={(e) => change(t.id, (e.target as HTMLInputElement).value)}
              />
              <span
                className={value === null ? 'scaled empty' : 'scaled'}
                data-testid={`scaled-${t.id}`}
                data-columns={t.columns.join(',')}
                aria-label={ptNew['scaled.aria']}
              >
                {value ?? ''}
              </span>
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

