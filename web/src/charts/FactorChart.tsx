import { ChartEmpty } from './ChartEmpty';
import { C, Dot, MIN_WIDTH, Txt, comma, frame, runs, useWidth } from './frame';
import type { ChartsDerived, FactorKey } from './derived';
import type { ChartPayloads } from '../engine/charts';
import { pt } from '../i18n/pt';
import { ptNew } from '../i18n/pt-new';
import { factorTip, useChartTip, type TargetSpec } from './tip';

// payload slots per factor (chartPayloads.factorial has 10 slots: 4 CV, 4 OP, 2 VP) and their subtest ids
const GROUPS: { key: FactorKey; ids: string[]; color: string; field: 'VerbalComprehension' | 'PerceptiveOrganization' | 'ProcessingVelocity'; from: number }[] = [
  { key: 'CV', ids: ['Information', 'Similarities', 'Vocabulary', 'Comprehension'], color: C.v, field: 'VerbalComprehension', from: 0 },
  { key: 'OP', ids: ['ImageCompletion', 'ImageDisposition', 'Cubes', 'ObjectComposition'], color: C.r, field: 'PerceptiveOrganization', from: 4 },
  { key: 'VP', ids: ['Code', 'SymbolSearch'], color: C.s3, field: 'ProcessingVelocity', from: 8 },
];
const TICKS = [1, 4, 7, 10, 13, 16, 19];

export function FactorChart({ payload, derived, optional }: { payload: ChartPayloads | null; derived: ChartsDerived | null; optional: Record<string, boolean> }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const w = Math.max(width, MIN_WIDTH);
  return (
    <figure className="fig">
      <figcaption>{ptNew['chart.factorial.title']}</figcaption>
      <div className="fig-body" ref={ref}>
        {payload && derived ? <FactorSvg payload={payload.factorial} derived={derived} optional={optional} w={w} /> : <ChartEmpty kind="factorial" />}
      </div>
      <p className="legend"><i className="sw v" />{pt['TestsPatternResults.VerbalComprehension']} <i className="sw r" />{pt['TestsPatternResults.PerceptiveOrganization']} <i className="sw s3" />{pt['TestsPatternResults.ProcessingVelocity']} <i className="sw m" />{ptNew['chart.factorial.mean']}</p>
    </figure>
  );
}

export function FactorSvg({ payload, derived, optional, w }: { payload: ChartPayloads['factorial']; derived: ChartsDerived; optional: Record<string, boolean>; w: number }) {
  const narrow = (w - 72) / 10 < 70;
  const h = narrow ? 300 : 280;
  const m = { l: 34, r: 10, t: 12, b: narrow ? 92 : 70 };
  const { g, y } = frame({ w, h, m, yMin: 1, yMax: 19, ticks: TICKS, bandLo: 7, bandHi: 13, midLine: 10 });
  const total = GROUPS.reduce((a, gr) => a + gr.ids.length, 0);
  const pad = 18;
  const unit = (w - m.l - m.r - pad * (GROUPS.length - 1)) / total;
  const tip = useChartTip('factorial', w, JSON.stringify(payload));
  const specs: Omit<TargetSpec, 'index' | 'count'>[] = [];
  let cursor = m.l;
  let marks = 0;
  const groups = GROUPS.map((gr) => {
    const x0 = cursor;
    const x1 = cursor + gr.ids.length * unit;
    cursor = x1 + pad;
    const values = payload[gr.field].slice(gr.from, gr.from + gr.ids.length);
    const px = (i: number) => x0 + unit * (i + 0.5);
    const mean = derived.factorMeans[gr.key];
    marks += values.filter((v) => v !== null).length;
    gr.ids.forEach((id, i) => {
      const v = values[i];
      if (v !== null) specs.push({ id, content: factorTip(id, gr.key, v, optional[id]), ax: px(i), ay: y(v), box: { x: x0 + unit * i, y: m.t, width: unit, height: h - m.t - m.b } });
    });
    return (
      <g key={gr.key} data-group={gr.key}>
        {mean !== null && <line data-mean={gr.key} x1={x0} x2={x1} y1={y(mean)} y2={y(mean)} stroke={gr.color} strokeWidth={1.5} strokeDasharray="2 4" opacity={0.8} />}
        {runs(values).map((run, k) => (
          <polyline key={k} fill="none" stroke={gr.color} strokeWidth={2.5} strokeLinejoin="round" points={run.map(([i, v]) => `${px(i)},${y(v)}`).join(' ')} />
        ))}
        {gr.ids.map((id, i) => {
          const v = values[i];
          return (
            <g key={id}>
              {v !== null && (
                <>
                  <Dot cx={px(i)} cy={y(v)} color={gr.color} optional={optional[id]} />
                  <Txt x={px(i)} y={y(v) - 10} fill={C.ink} weight={600}>{v}</Txt>
                </>
              )}
              <Txt x={px(i)} y={h - m.b + 16} size={11.5} anchor={narrow ? 'end' : 'middle'} rot={narrow ? -50 : 0}>{ptNew[`chart.short.${id}`]}</Txt>
            </g>
          );
        })}
        <Txt x={(x0 + x1) / 2} y={h - 8} size={narrow ? 12 : 13} fill={C.ink} weight={600}>
          {mean === null ? gr.key : ptNew['chart.factorial.groupMean'].replace('{0}', gr.key).replace('{1}', comma(mean))}
        </Txt>
      </g>
    );
  });
  const svg = (
    <svg ref={tip.svgRef} onKeyDown={tip.onKeyDown} viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="group" aria-label={ptNew['chart.factorial.aria']} data-testid="chart-factorial" data-marks={marks} data-group-means={JSON.stringify(derived.factorMeans)}>
      {g}
      {groups}
      {specs.map((s, k) => tip.target({ ...s, index: k, count: specs.length }))}
    </svg>
  );
  return <>{svg}{tip.overlay}</>;
}
