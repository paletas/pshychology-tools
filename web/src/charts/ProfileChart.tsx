import { ChartEmpty } from './ChartEmpty';
import { C, Dot, MIN_WIDTH, Txt, frame, runs, useWidth } from './frame';
import type { ChartPayloads } from '../engine/charts';
import { pt } from '../i18n/pt';
import { ptNew } from '../i18n/pt-new';

// payload slot -> subtest id (the order of chartPayloads.standardResults: 6 verbal, then 7 realization)
export const PROFILE_IDS = ['Information', 'Similarities', 'Arithmetic', 'Vocabulary', 'Comprehension', 'DigitMemory', 'ImageCompletion', 'Code', 'ImageDisposition', 'Cubes', 'ObjectComposition', 'SymbolSearch', 'Labyrinth'];
const TICKS = [1, 4, 7, 10, 13, 16, 19];

export function ProfileChart({ payload, optional }: { payload: ChartPayloads | null; optional: Record<string, boolean> }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const w = Math.max(width, MIN_WIDTH);
  return (
    <figure className="fig">
      <figcaption>{ptNew['chart.standard.title']}</figcaption>
      <div className="fig-body" ref={ref}>
        {payload ? <ProfileSvg payload={payload.standardResults} optional={optional} w={w} /> : <ChartEmpty kind="standard" />}
      </div>
      <p className="legend"><i className="sw v" />{pt['QI.Verbal']} <i className="sw r" />{pt['QI.Realization']} <i className="sw o" />{ptNew['chart.standard.optional']}</p>
    </figure>
  );
}

export function ProfileSvg({ payload, optional, w }: { payload: ChartPayloads['standardResults']; optional: Record<string, boolean>; w: number }) {
  const n = PROFILE_IDS.length;
  const narrow = (w - 44) / n < 70;
  const h = narrow ? 300 : 280;
  const m = { l: 34, r: 10, t: 12, b: narrow ? 74 : 58 };
  const { g, y } = frame({ w, h, m, yMin: 1, yMax: 19, ticks: TICKS, bandLo: 7, bandHi: 13, midLine: 10 });
  const step = (w - m.l - m.r) / n;
  const x = (i: number) => m.l + step * (i + 0.5);
  const lines = [
    { key: 'V', color: C.v, values: payload.Verbal },
    { key: 'R', color: C.r, values: payload.Realization },
  ];
  const marks = lines.reduce((a, l) => a + l.values.filter((v) => v !== null).length, 0);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={ptNew['chart.standard.aria']} data-testid="chart-standard" data-marks={marks}>
      {g}
      {lines.map((l) => (
        <g key={l.key}>
          {runs(l.values).map((run, k) => (
            <polyline key={k} fill="none" stroke={l.color} strokeWidth={2.5} strokeLinejoin="round" points={run.map(([i, v]) => `${x(i)},${y(v)}`).join(' ')} />
          ))}
          {runs(l.values).flat().map(([i, v]) => (
            <g key={i}>
              <Dot cx={x(i)} cy={y(v)} color={l.color} optional={optional[PROFILE_IDS[i]]} />
              <Txt x={x(i)} y={y(v) - 10} fill={C.ink} weight={600}>{v}</Txt>
            </g>
          ))}
        </g>
      ))}
      {PROFILE_IDS.map((id, i) => (
        <Txt key={id} x={x(i)} y={h - m.b + 16} size={11.5} anchor={narrow ? 'end' : 'middle'} rot={narrow ? -50 : 0}>{ptNew[`chart.short.${id}`]}</Txt>
      ))}
    </svg>
  );
}
