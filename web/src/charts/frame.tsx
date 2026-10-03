import { useEffect, useRef, useState, type ReactNode } from 'react';

export const MIN_WIDTH = 280;

/** Width of the element in CSS pixels, kept up to date with a ResizeObserver (0 before layout and in jsdom). */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export interface Margins { l: number; r: number; t: number; b: number }

export const C = { ink: 'var(--ink)', ink2: 'var(--ink-2)', line: 'var(--line)', band: 'var(--band)', v: 'var(--petrol)', v2: 'var(--petrol-soft)', r: 'var(--series2)', s3: 'var(--series3)', sheet: 'var(--sheet)' };

export const comma = (v: number, digits = 1) => v.toFixed(digits).replace('.', ',');

interface TextProps { x: number; y: number; size?: number; anchor?: 'start' | 'middle' | 'end'; fill?: string; weight?: number; rot?: number; children: ReactNode }

/** SVG text; the size is never below 11. */
export function Txt({ x, y, size = 12, anchor = 'middle', fill = C.ink2, weight, rot, children }: TextProps) {
  return (
    <text x={x} y={y} fontSize={Math.max(11, size)} textAnchor={anchor} fill={fill} fontWeight={weight} transform={rot ? `rotate(${rot} ${x} ${y})` : undefined}>
      {children}
    </text>
  );
}

/** Round point: filled, or an empty circle for an optional subtest. */
export function Dot({ cx, cy, color, optional }: { cx: number; cy: number; color: string; optional?: boolean }) {
  return <circle data-mark="point" cx={cx} cy={cy} r={optional ? 4.5 : 5.5} fill={optional ? C.sheet : color} stroke={color} strokeWidth={2} />;
}

interface FrameProps {
  w: number;
  h: number;
  m: Margins;
  yMin: number;
  yMax: number;
  ticks: number[];
  bandLo: number;
  bandHi: number;
  midLine: number;
}

/** Plot background: the shaded band, the horizontal grid with y tick labels and the dashed mid line. Returns the y mapping too. */
export function frame({ w, h, m, yMin, yMax, ticks, bandLo, bandHi, midLine }: FrameProps) {
  const y = (v: number) => m.t + ((yMax - v) / (yMax - yMin)) * (h - m.t - m.b);
  const lo = Math.max(bandLo, yMin);
  const hi = Math.min(bandHi, yMax);
  const g = (
    <g>
      {hi > lo && <rect data-band="" x={m.l} y={y(hi)} width={w - m.l - m.r} height={y(lo) - y(hi)} fill={C.band} />}
      {ticks.map((v) => (
        <g key={v}>
          <line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} stroke={C.line} />
          <Txt x={m.l - 8} y={y(v) + 4} anchor="end">{v}</Txt>
        </g>
      ))}
      {midLine >= yMin && midLine <= yMax && <line x1={m.l} x2={w - m.r} y1={y(midLine)} y2={y(midLine)} stroke={C.ink2} strokeDasharray="4 4" />}
    </g>
  );
  return { g, y };
}

/** Consecutive runs of non-null values as [slot, value] pairs; a gap (unscored subtest) splits the line. */
export function runs(values: (number | null)[], offset = 0): [number, number][][] {
  const out: [number, number][][] = [];
  let cur: [number, number][] = [];
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push([offset + i, v]);
  });
  if (cur.length) out.push(cur);
  return out;
}
