import { COLUMNS } from '../engine/types';
import type { RefData, Snapshot } from '../engine/types';
import { pt } from '../i18n/pt';

interface Props {
  data: RefData;
  snapshot: Snapshot;
  raw: Record<string, number | null>;
  onRaw: (testId: string, value: number | null) => void;
}

const HEAD_KEYS = ['Verbal', 'Realization', 'VerbalComprehension', 'PerceptiveOrganization', 'ProcessingVelocity'];

export function SubtestTable({ data, snapshot, raw, onRaw }: Props) {
  const change = (testId: string, text: string) => {
    if (text === '') return onRaw(testId, null);
    const n = Number(text);
    if (Number.isInteger(n)) onRaw(testId, n);
  };
  return (
    <div className="flex-1 bg-gray-100 rounded-xl shadow-md justify-items-center p-2 focus-within:border-2 focus-within:border-gray-600 overflow-x-auto">
      <table className="table-fixed w-full border-2 border-gray-600 border-separate items-center rounded-xl bg-gray-600">
        <thead className="text-white">
          <tr>
            <td rowSpan={2} className="w-2/6 uppercase font-bold">{pt['TestsDescription']}</td>
            <td rowSpan={2} className="w-1/6 uppercase font-bold">{pt['TestsRawResults']}</td>
            <td colSpan={5} className="w-3/6 uppercase font-bold">{pt['TestsPatternResults']}</td>
          </tr>
          <tr className="bg-gray-400">
            {HEAD_KEYS.map((k) => (
              <td key={k} data-toggle="tooltip" className="uppercase font-bold" title={pt[`TestsPatternResults.${k}.MouseHover`]}>
                {pt[`TestsPatternResults.${k}`]}
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.tests.map((t) => {
            const s = snapshot.tests[t.id];
            const r = raw[t.id] ?? null;
            return (
              <tr key={t.id} className="bg-gray-100" data-testid={`subtest-row-${t.id}`}>
                <td className={t.mandatory ? 'bg-gray-400' : 'bg-gray-300'}>
                  <span>{pt[`Test.${t.id}`]}</span>
                  <svg className={`float-right text-red-900 w-6 h-6 ${s.outOfBounds ? 'inline' : 'hidden'}`} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd">
                      <title>{pt['TestsPatternResults.Error.OutOfBounds'].replace('{0}', String(s.min)).replace('{1}', String(s.max))}</title>
                    </path>
                  </svg>
                </td>

                <td>
                  <input
                    type="number"
                    className="w-full border-0 bg-white"
                    data-testid={`raw-${t.id}`}
                    value={r ?? ''}
                    min={s.min ?? undefined}
                    max={s.max ?? undefined}
                    onChange={(e) => change(t.id, e.target.value)}
                    onInput={(e) => change(t.id, (e.target as HTMLInputElement).value)}
                  />
                </td>

                {COLUMNS.map((c, i) => {
                  const v = s.scaled[i];
                  return (
                    <td key={c} className={r !== null && v !== null ? undefined : 'bg-gray-400'} data-testid={`scaled-${t.id}-${c}`}>
                      {v ?? ''}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-gray-100">
            <td className="bg-gray-400">{pt['Test.SumResults']}</td>
            <td className="bg-gray-600"></td>
            {COLUMNS.map((c) => (
              <td key={c} data-testid={`sum-${c}`}>{snapshot.sums[c]}</td>
            ))}
          </tr>
          <tr>
            <td colSpan={2}></td>
            <td colSpan={2} className="border-t-2 bg-gray-100" data-testid="sum-complete">{snapshot.sums.complete}</td>
            <td colSpan={4}></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
