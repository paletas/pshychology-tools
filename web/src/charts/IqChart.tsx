import { ChartEmpty } from './ChartEmpty';
import { C, MIN_WIDTH, Txt, frame, useWidth } from './frame';
import type { ChartPayloads } from '../engine/charts';
import { ptNew } from '../i18n/pt-new';
import { IQ_KEYS, iqTip, useChartTip, type TargetSpec } from './tip';

export type IqCi = 'Percentil90' | 'Percentil95';
const CAP = 999;

export function IqChart({ payload, ci }: { payload: ChartPayloads | null; ci: IqCi }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const w = Math.max(width, MIN_WIDTH);
  return (
    <figure className="fig wide">
      <figcaption>{ptNew['chart.qi.title']}</figcaption>
      <div className="fig-body" ref={ref}>{payload ? <IqSvg payload={payload.qi} ci={ci} w={w} /> : <ChartEmpty kind="qi" />}</div>
      <p className="legend"><i className="sw band" />{ptNew['chart.qi.band']} <i className="sw ci" />{ptNew['chart.qi.ci']} <i className="sw v" />{ptNew['chart.qi.result']}</p>
    </figure>
  );
}

/** y range: min = floor(m/5)*5 over the 95% lower bounds, max = max(145, ceil(M/5)*5) over the finite values (999 excluded). */
export function iqRange(entries: ChartPayloads['qi']['QI']): { yMin: number; yMax: number } {
  const lows = entries.map((e) => e.min).filter((v): v is number => v !== null && Number.isFinite(v));
  const highs = entries.flatMap((e) => [e.max, e.median]).filter((v): v is number => v !== null && Number.isFinite(v) && v !== CAP);
  const yMin = lows.length ? Math.floor(Math.min(...lows) / 5) * 5 : 55;
  const yMax = Math.max(145, highs.length ? Math.ceil(Math.max(...highs) / 5) * 5 : 145);
  return { yMin, yMax };
}

export function IqSvg({ payload, ci, w }: { payload: ChartPayloads['qi']; ci: IqCi; w: number }) {
  const entries = [...payload.QI, ...payload.Indices];
  const narrow = w < 520;
  const h = narrow ? 300 : 320;
  const m = { l: 40, r: 10, t: 14, b: narrow ? 70 : 46 };
  const { yMin, yMax } = iqRange(entries);
  const ticks: number[] = [];
  for (let v = Math.ceil(yMin / 10) * 10; v <= yMax; v += 10) ticks.push(v);
  const { g, y } = frame({ w, h, m, yMin, yMax, ticks, bandLo: 85, bandHi: 115, midLine: 100 });
  const step = (w - m.l - m.r) / entries.length;
  const bw = Math.min(26, step * 0.38);
  const clamp = (v: number) => Math.min(yMax, Math.max(yMin, v));
  const tip = useChartTip('qi', w, JSON.stringify(payload) + ci);
  const specs: Omit<TargetSpec, 'index' | 'count'>[] = [];
  let marks = 0;
  const slots = entries.map((e, i) => {
    const cx = m.l + step * (i + 0.5);
    const label = <Txt x={cx} y={h - m.b + 16} size={11.5} anchor={narrow ? 'end' : 'middle'} rot={narrow ? -50 : 0}>{ptNew[`chart.iq.${IQ_KEYS[i]}`]}</Txt>;
    // an unavailable index has all-null values: its slot stays empty
    if (e.median === null) return <g key={i} data-slot={IQ_KEYS[i]} data-empty="">{label}</g>;
    marks++;
    const [a, b] = ci === 'Percentil90' ? [e.q1, e.q3] : [e.min, e.max];
    const capped = e.median === CAP;
    const iy = y(clamp(capped ? yMax : e.median));
    const top = b === null ? iy : y(clamp(b));
    specs.push({ id: IQ_KEYS[i], content: iqTip(i, e), ax: cx, ay: Math.min(top, iy) - 20, box: { x: m.l + step * i, y: m.t, width: step, height: h - m.t - m.b } });
    return (
      <g key={i} data-slot={IQ_KEYS[i]} data-mark="index" data-capped={capped ? '' : undefined}>
        {a !== null && b !== null && <rect x={cx - bw / 2} y={y(clamp(b))} width={bw} height={Math.max(0, y(clamp(a)) - y(clamp(b)))} rx={bw / 2} fill={C.v2} opacity={0.55} />}
        {capped ? (
          <path d={`M${cx - bw * 0.8} ${iy + 9} L${cx} ${iy} L${cx + bw * 0.8} ${iy + 9} Z`} fill={C.v} stroke={C.v} strokeWidth={2} strokeLinejoin="round" />
        ) : (
          <line x1={cx - bw * 0.8} x2={cx + bw * 0.8} y1={iy} y2={iy} stroke={C.v} strokeWidth={4} strokeLinecap="round" />
        )}
        <Txt x={cx} y={Math.min(top, iy) - 8} size={13} fill={C.ink} weight={700}>{e.median}</Txt>
        {label}
      </g>
    );
  });
  const svg = (
    <svg ref={tip.svgRef} onKeyDown={tip.onKeyDown} viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="group" aria-label={ptNew['chart.qi.aria']} data-testid="chart-qi" data-marks={marks} data-y-min={yMin} data-y-max={yMax}>
      {g}
      {slots}
      {specs.map((s, k) => tip.target({ ...s, index: k, count: specs.length }))}
    </svg>
  );
  return <>{svg}{tip.overlay}</>;
}
