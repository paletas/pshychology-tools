import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { BoxPlotEntry } from '../engine/charts';
import { formatCi } from '../engine/format';
import { pt } from '../i18n/pt';
import { ptNew } from '../i18n/pt-new';
import { fmt } from '../ui/template';

export type TipKind = 'standard' | 'factorial' | 'qi';
export interface TipLine { text: string; sw?: 'v' | 'r' | 's3' }
export interface TipContent { title: string; lines: TipLine[] }

export const IQ_KEYS = ['V', 'R', 'EC', 'CV', 'OP', 'VP'] as const;

export const tipLabel = (c: TipContent) => [c.title, ...c.lines.map((l) => l.text)].join('. ');

export const subtestTitle = (id: string, optional: boolean): string => pt[`Test.${id}`] + (optional ? ' ' + ptNew['optional'] : '');

/** Standard profile: slot < 6 is a verbal subtest, the rest are realization. */
export function profileTip(id: string, slot: number, v: number, optional: boolean): TipContent {
  const verbal = slot < 6;
  return { title: subtestTitle(id, optional), lines: [{ text: pt[verbal ? 'QI.Verbal' : 'QI.Realization'] + ': ' + v, sw: verbal ? 'v' : 'r' }] };
}

const FACTOR = {
  CV: { key: 'QI.VerbalComprehension', sw: 'v' },
  OP: { key: 'QI.PerceptiveOrganization', sw: 'r' },
  VP: { key: 'QI.ProcessingVelocity', sw: 's3' },
} as const;

export function factorTip(id: string, group: 'CV' | 'OP' | 'VP', v: number, optional: boolean): TipContent {
  const f = FACTOR[group];
  return { title: subtestTitle(id, optional), lines: [{ text: pt[f.key] + ': ' + v, sw: f.sw }] };
}

export function iqTip(slot: number, e: BoxPlotEntry): TipContent {
  const title = slot < 3 ? ptNew[`chart.iq.${IQ_KEYS[slot]}`] : e.label;
  return {
    title,
    lines: [
      { text: ptNew['chart.qi.result'] + ': ' + e.median, sw: 'v' },
      { text: fmt(ptNew['ci.range'], 90) + ' ' + formatCi(e.q1 !== null && e.q3 !== null ? [e.q1, e.q3] : null) },
      { text: fmt(ptNew['ci.range'], 95) + ' ' + formatCi(e.min !== null && e.max !== null ? [e.min, e.max] : null) },
    ],
  };
}

interface Active { id: string; content: TipContent; ax: number; ay: number }

export interface TargetSpec {
  index: number;
  count: number;
  id: string;
  content: TipContent;
  ax: number;
  ay: number;
  box: { x: number; y: number; width: number; height: number };
}

/** Hover / focus / tap tooltips for one SVG chart: transparent full-column targets plus an HTML overlay next to the svg. */
export function useChartTip(kind: TipKind, w: number, resetKey: string) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Active | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);

  useEffect(() => setActive(null), [resetKey]);

  useEffect(() => {
    if (!active) return;
    const down = (ev: PointerEvent) => {
      const t = ev.target as Element | null;
      const hit = t?.closest?.('.tip-hit');
      if (!hit || !svgRef.current?.contains(hit)) setActive(null);
    };
    const key = (ev: globalThis.KeyboardEvent) => { if (ev.key === 'Escape') setActive(null); };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
    };
  }, [active]);

  useLayoutEffect(() => {
    const tip = tipRef.current;
    const svg = svgRef.current;
    const body = svg?.parentElement;
    if (!active || !tip || !svg || !body) return;
    const sr = svg.getBoundingClientRect();
    const br = body.getBoundingClientRect();
    const scale = sr.width > 0 ? sr.width / w : 1;
    const ax = sr.left - br.left + active.ax * scale;
    const ay = sr.top - br.top + active.ay * scale;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const bodyW = br.width > 0 ? br.width : body.clientWidth;
    const lo = tw / 2 + 4;
    const hi = Math.max(lo, bodyW - tw / 2 - 4);
    tip.style.left = `${Math.min(hi, Math.max(lo, ax))}px`;
    tip.style.top = `${ay}px`;
    if (ay - th - 12 < 0) tip.setAttribute('data-below', '');
    else tip.removeAttribute('data-below');
  }, [active, w]);

  const onKeyDown = (ev: KeyboardEvent<SVGSVGElement>) => {
    if (ev.key === 'Escape') { setActive(null); return; }
    const svg = svgRef.current;
    if (!svg) return;
    const list = [...svg.querySelectorAll<SVGElement>('.tip-hit')];
    const n = list.length;
    if (!n) return;
    const cur = list.indexOf(document.activeElement as SVGElement);
    let next: number;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') next = Math.min(cur + 1, n - 1);
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') next = Math.max(cur - 1, 0);
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = n - 1;
    else return;
    list[next].focus();
    ev.preventDefault();
  };

  const target = ({ index, count, id, content, ax, ay, box }: TargetSpec) => {
    const tid = `${kind}-${id}`;
    const show = () => setActive({ id: tid, content, ax, ay });
    const hide = () => setActive((a) => (a && a.id === tid ? null : a));
    return (
      <rect
        key={'tip-' + id}
        className="tip-hit"
        data-tip={tid}
        data-active={active?.id === tid ? '' : undefined}
        role="img"
        aria-label={tipLabel(content)}
        tabIndex={index === (focusIdx < count ? focusIdx : 0) ? 0 : -1}
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        onFocus={() => { setFocusIdx(index); show(); }}
        onBlur={hide}
        onPointerEnter={(e) => { if (e.pointerType !== 'touch') show(); }}
        onPointerLeave={(e) => { if (e.pointerType !== 'touch') hide(); }}
        onClick={show}
      />
    );
  };

  const overlay = active ? (
    <div className="chart-tip" ref={tipRef} data-testid={`chart-tip-${kind}`} data-tip-for={active.id} aria-hidden="true">
      <strong data-testid="chart-tip-title">{active.content.title}</strong>
      {active.content.lines.map((l, i) => (
        <span key={i} data-testid="chart-tip-line">{l.sw && <i className={`sw ${l.sw}`} />}{l.text}</span>
      ))}
    </div>
  ) : null;

  return { svgRef, onKeyDown, target, overlay };
}
