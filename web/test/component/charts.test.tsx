import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChartsSection } from '../../src/charts/ChartsSection';
import { chartsDerived } from '../../src/charts/derived';
import type { IqCi } from '../../src/charts/IqChart';
import { installDebug } from '../../src/debug';
import { chartPayloads, type ChartPayloads } from '../../src/engine/charts';
import { scoreCase } from '../../src/engine/scoring';
import { pt } from '../../src/i18n/pt';
import { ptNew } from '../../src/i18n/pt-new';
import { parseBundle } from '../../src/refdata/schema';
import { birthFor } from '../shared/load';

const data = parseBundle(readFileSync(resolve(__dirname, '../../public/reference/baseline.json'), 'utf8'));
const TEST_DATE = '2026-10-03';
const AGE: [number, number, number] = [9, 3, 12];
const RAW = { ImageCompletion: 15, Information: 15, Code: 59, Similarities: 16, ImageDisposition: 32, Arithmetic: 15, Cubes: 34, Vocabulary: 30, ObjectComposition: 22, Comprehension: 18, SymbolSearch: 22, DigitMemory: 15, Labyrinth: 14 };
const optional = Object.fromEntries(data.tests.map((t) => [t.id, !t.mandatory]));

// The payload the harness reads, for the case above, as produced before the Chart.js removal (fixture: it must not change).
const FIXTURE: ChartPayloads = {
  standardResults: {
    Labels: ['Inf', 'Sem', 'Ari', 'Voc', 'Com', 'MD', 'CG', 'Cd', 'DG', 'Cb', 'CO', 'PS', 'Lb'],
    Verbal: [12, 14, 13, 19, 18, 14, null, null, null, null, null, null, null],
    Realization: [null, null, null, null, null, null, 9, 18, 14, 11, 9, 13, 8],
  },
  factorial: {
    Labels: ['Inf', 'Sem', 'Voc', 'Com', 'CG', 'DG', 'Cb', 'CO', 'Cd', 'PS'],
    VerbalComprehension: [12, 14, 19, 18, null, null, null, null, null, null],
    PerceptiveOrganization: [null, null, null, null, 9, 14, 11, 9, null, null],
    ProcessingVelocity: [null, null, null, null, null, null, null, null, 18, 13],
  },
  qi: {
    QI: [
      { label: 'Verbal', min: 123, max: 138, q1: 125, q3: 137, median: 133 },
      { label: 'Realização', min: 104, max: 122, q1: 106, q3: 121, median: 115 },
      { label: 'Escala Completa', min: 116, max: 134, q1: 118, q3: 132, median: 128 },
    ],
    Indices: [
      { label: 'Compreensão Verbal', min: 123, max: 139, q1: 124, q3: 138, median: 134 },
      { label: 'Organização Perceptiva', min: 94, max: 113, q1: 96, q3: 111, median: 104 },
      { label: 'Velocidade de Processamento', min: 113, max: 135, q1: 115, q3: 133, median: 131 },
    ],
  },
};

const snap = () => scoreCase(data, { testDate: TEST_DATE, birthDate: birthFor(TEST_DATE, AGE), raw: RAW });

function show(p: ChartPayloads | null, ci: IqCi = 'Percentil95') {
  return render(<ChartsSection payload={p} derived={chartsDerived(p)} ci={ci} optional={optional} />);
}
const svg = (c: HTMLElement, id: string) => c.querySelector<SVGSVGElement>(`svg[data-testid="${id}"]`)!;

afterEach(cleanup);

describe('chart payloads (unchanged)', () => {
  it('equals the fixture for a fully scored case', () => {
    expect(snap().indicesShown).toBe(true);
    expect(chartPayloads(snap(), pt)).toEqual(FIXTURE);
  });

  it('keeps an unavailable index as an all-null entry (3 QI + 3 indices)', () => {
    const s = snap();
    s.indices.processingVelocity = { ...s.indices.processingVelocity!, entry: 'unavailable' };
    const p = chartPayloads(s, pt)!;
    expect(p.qi.QI).toHaveLength(3);
    expect(p.qi.Indices).toHaveLength(3);
    expect(p.qi.Indices[2]).toEqual({ label: 'Velocidade de Processamento', min: null, max: null, q1: null, q3: null, median: null });
    expect(p.qi.Indices[0]).toEqual(FIXTURE.qi.Indices[0]);
  });

  it('derived group means are additive and do not touch the payload', () => {
    const before = JSON.stringify(FIXTURE);
    expect(chartsDerived(FIXTURE)).toEqual({ factorMeans: { CV: 15.75, OP: 10.75, VP: 15.5 } });
    expect(JSON.stringify(FIXTURE)).toBe(before);
    expect(chartsDerived(null)).toBeNull();
  });
});

describe('SVG charts', () => {
  it('draws the marks (13 / 10 / 6), role=group, test ids, no NaN, text at least 11 px', () => {
    const { container } = show(FIXTURE);
    for (const [id, n, items] of [['chart-standard', 13, 13], ['chart-factorial', 10, 10], ['chart-qi', 6, 6]] as const) {
      const el = svg(container, id);
      expect(el, id).toBeTruthy();
      expect(el.getAttribute('role')).toBe('group');
      expect(el.getAttribute('aria-label')).toBeTruthy();
      expect(el.getAttribute('data-marks')).toBe(String(n));
      expect(el.querySelectorAll('[data-mark]')).toHaveLength(items);
      expect(el.outerHTML).not.toMatch(/NaN|undefined|Infinity/);
      const sizes = [...el.querySelectorAll('text')].map((t) => Number(t.getAttribute('font-size')));
      expect(sizes.length).toBeGreaterThan(0);
      expect(Math.min(...sizes), id).toBeGreaterThanOrEqual(11);
    }
    expect(container.querySelector('h2')!.textContent).toBe(ptNew['charts.title']);
    expect(container.querySelectorAll('figure.fig')).toHaveLength(3);
  });

  it('renders at width 0 (no layout) with the 280 px minimum', () => {
    const { container } = show(FIXTURE);
    for (const id of ['chart-standard', 'chart-factorial', 'chart-qi']) {
      expect(svg(container, id).getAttribute('width')).toBe('280');
      expect(svg(container, id).getAttribute('viewBox')).toMatch(/^0 0 280 \d+$/);
    }
  });

  it('draws the optional subtests as empty circles and the 7-13 / 85-115 bands', () => {
    const { container } = show(FIXTURE);
    const std = svg(container, 'chart-standard');
    const empties = [...std.querySelectorAll('circle')].filter((c) => c.getAttribute('fill') === 'var(--sheet)');
    expect(empties).toHaveLength(3); // DigitMemory, SymbolSearch, Labyrinth
    expect(std.querySelectorAll('[data-band]')).toHaveLength(1);
    expect(svg(container, 'chart-qi').querySelectorAll('[data-band]')).toHaveLength(1);
    // the profile draws a Verbal and a Realização line
    expect(std.querySelectorAll('polyline')).toHaveLength(2);
  });

  it('factor chart: connected line per factor, dashed group means, labels with the mean, data-group-means', () => {
    const { container } = show(FIXTURE);
    const f = svg(container, 'chart-factorial');
    expect(f.querySelectorAll('polyline')).toHaveLength(3);
    const means = [...f.querySelectorAll('line[data-mean]')];
    expect(means.map((l) => l.getAttribute('data-mean'))).toEqual(['CV', 'OP', 'VP']);
    for (const l of means) expect(l.getAttribute('stroke-dasharray')).toBeTruthy();
    const texts = [...f.querySelectorAll('text')].map((t) => t.textContent);
    expect(texts).toContain('CV · média 15,8');
    expect(texts).toContain('OP · média 10,8');
    expect(texts).toContain('VP · média 15,5');
    expect(JSON.parse(f.getAttribute('data-group-means')!)).toEqual({ CV: 15.75, OP: 10.75, VP: 15.5 });
    const colours = [...f.querySelectorAll('polyline')].map((p) => p.getAttribute('stroke'));
    expect(new Set(colours).size).toBe(3);
  });

  it('factor chart: an unscored subtest leaves a gap and the mean uses the scored ones', () => {
    const p = structuredClone(FIXTURE);
    p.factorial.ProcessingVelocity[9] = null; // symbol search not given
    const { container } = show(p);
    const f = svg(container, 'chart-factorial');
    expect(f.getAttribute('data-marks')).toBe('9');
    expect(JSON.parse(f.getAttribute('data-group-means')!).VP).toBe(18);
    expect([...f.querySelectorAll('text')].map((t) => t.textContent)).toContain('VP · média 18,0');
  });

  it('QI chart: y-min = floor(m/5)*5 on data-y-min, max 145, harness axis reads the SVG', () => {
    const { container } = show(FIXTURE);
    const q = svg(container, 'chart-qi');
    expect(q.getAttribute('data-y-min')).toBe('90'); // lowest 95% bound is 94
    expect(q.getAttribute('data-y-max')).toBe('145');
    installDebug();
    expect(window.__wisc3Debug.chartAxis('chart-qi')).toEqual({ min: 90, max: 145 });
    expect(window.__wisc3Debug.chartAxis('chart-nothing')).toBeNull();
  });

  it('QI chart: an unavailable index is an empty slot', () => {
    const p = structuredClone(FIXTURE);
    p.qi.Indices[2] = { label: 'Velocidade de Processamento', min: null, max: null, q1: null, q3: null, median: null };
    const { container } = show(p);
    const q = svg(container, 'chart-qi');
    expect(q.getAttribute('data-marks')).toBe('5');
    expect(q.querySelectorAll('[data-empty]')).toHaveLength(1);
    expect(q.querySelector('[data-slot="VP"]')!.querySelectorAll('rect,line,path')).toHaveLength(0);
    expect(q.querySelector('[data-slot="VP"] text')!.textContent).toBe(ptNew['chart.iq.VP']);
    expect(q.outerHTML).not.toMatch(/NaN/);
  });

  it('QI chart: a 999 value is a capped marker at the top, labelled 999, and does not blow up the axis', () => {
    const p = structuredClone(FIXTURE);
    p.qi.QI[2] = { label: 'Escala Completa', min: 146, max: 163, q1: 147, q3: 162, median: 999 };
    const { container } = show(p);
    const q = svg(container, 'chart-qi');
    const capped = q.querySelectorAll('[data-capped]');
    expect(capped).toHaveLength(1);
    expect(capped[0].querySelector('path')).toBeTruthy();
    expect([...capped[0].querySelectorAll('text')].map((t) => t.textContent)).toContain('999');
    expect(q.getAttribute('data-y-max')).toBe('165');
    expect(q.outerHTML).not.toMatch(/NaN|Infinity/);
  });

  it('QI chart: the bar follows the chosen interval (90% is shorter than 95%)', () => {
    const height = (ci: IqCi) => {
      const { container, unmount } = show(FIXTURE, ci);
      const h = Number(svg(container, 'chart-qi').querySelector('[data-slot="V"] rect')!.getAttribute('height'));
      unmount();
      return h;
    };
    expect(height('Percentil90')).toBeLessThan(height('Percentil95'));
  });

  it('a null payload renders the three empty states and no marks (REV-12)', () => {
    const { container } = show(null);
    expect(container.querySelectorAll('svg')).toHaveLength(0);
    for (const k of ['standard', 'factorial', 'qi']) {
      const el = container.querySelector(`[data-testid="chart-empty-${k}"]`)!;
      expect(el.textContent).toBe(ptNew['chart.empty']);
      expect(el.getAttribute('data-marks')).toBe('0');
    }
    expect(container.querySelectorAll('figure.fig')).toHaveLength(3);
  });
});

describe('[REV-14] chart tooltips', () => {
  const tipText = (c: HTMLElement, kind: string) => {
    const el = c.querySelector(`[data-testid="chart-tip-${kind}"]`);
    if (!el) return null;
    return {
      for: el.getAttribute('data-tip-for'),
      title: el.querySelector('[data-testid="chart-tip-title"]')!.textContent,
      lines: [...el.querySelectorAll('[data-testid="chart-tip-line"]')].map((l) => l.textContent),
    };
  };
  const hit = (c: HTMLElement, tip: string) => c.querySelector<SVGElement>(`[data-tip="${tip}"]`)!;
  const clone = () => JSON.parse(JSON.stringify(FIXTURE)) as ChartPayloads;
  const title = (id: string) => pt[`Test.${id}`] + (optional[id] ? ' ' + ptNew['optional'] : '');

  function guarded(fn: () => void) {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      fn();
      expect(err).toHaveBeenCalledTimes(0);
    } finally {
      err.mockRestore();
    }
  }

  it('(1) one target per mark, one tab stop per chart, no tooltip before interaction', () => guarded(() => {
    const { container } = show(FIXTURE);
    for (const [id, n] of [['chart-standard', 13], ['chart-factorial', 10], ['chart-qi', 6]] as const) {
      const el = svg(container, id);
      expect(el.querySelectorAll('.tip-hit')).toHaveLength(n);
      expect(el.getAttribute('data-marks')).toBe(String(n));
      expect(el.querySelectorAll('[data-mark]')).toHaveLength(n);
      expect(el.querySelectorAll('.tip-hit[tabindex="0"]')).toHaveLength(1);
      expect(el.querySelectorAll('.tip-hit[data-mark]')).toHaveLength(0);
    }
    expect(container.querySelectorAll('[data-testid^="chart-tip-"]')).toHaveLength(0);
  }));

  it('(2) QI tooltip: result and both intervals; Escape closes it', () => guarded(() => {
    const { container } = show(FIXTURE);
    fireEvent.click(hit(container, 'qi-V'));
    expect(tipText(container, 'qi')).toEqual({ for: 'qi-V', title: 'QI Verbal', lines: ['Resultado: 133', 'Intervalo a 90%: 125 - 137', 'Intervalo a 95%: 123 - 138'] });
    expect(hit(container, 'qi-V').getAttribute('aria-label')).toBe('QI Verbal. Resultado: 133. Intervalo a 90%: 125 - 137. Intervalo a 95%: 123 - 138');
    fireEvent.click(hit(container, 'qi-CV'));
    expect(tipText(container, 'qi')).toEqual({ for: 'qi-CV', title: 'Compreensão Verbal', lines: ['Resultado: 134', 'Intervalo a 90%: 124 - 138', 'Intervalo a 95%: 123 - 139'] });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(tipText(container, 'qi')).toBeNull();
  }));

  it('(3) standard and factorial tooltips', () => guarded(() => {
    const { container } = show(FIXTURE);
    fireEvent.click(hit(container, 'standard-Information'));
    expect(tipText(container, 'standard')).toMatchObject({ title: 'Informação', lines: ['Verbal: 12'] });
    fireEvent.click(hit(container, 'standard-Labyrinth'));
    expect(tipText(container, 'standard')).toMatchObject({ title: title('Labyrinth'), lines: ['Realização: 8'] });
    fireEvent.click(hit(container, 'factorial-Code'));
    expect(tipText(container, 'factorial')).toMatchObject({ title: title('Code'), lines: ['Velocidade de Processamento: 18'] });
  }));

  it('(4) both intervals show whatever the CI selector says', () => guarded(() => {
    const lines = (ci: IqCi) => {
      const { container, unmount } = show(FIXTURE, ci);
      fireEvent.click(hit(container, 'qi-V'));
      const t = tipText(container, 'qi')!.lines;
      unmount();
      return t;
    };
    expect(lines('Percentil90')).toEqual(lines('Percentil95'));
  }));

  it('(5) an unavailable index has no target; 999 is shown as 999', () => guarded(() => {
    const a = clone();
    a.qi.Indices[2] = { label: 'Velocidade de Processamento', min: null, max: null, q1: null, q3: null, median: null };
    const first = show(a);
    expect(first.container.querySelector('[data-tip="qi-VP"]')).toBeNull();
    expect(svg(first.container, 'chart-qi').querySelectorAll('.tip-hit')).toHaveLength(5);
    first.unmount();
    const b = clone();
    b.qi.QI[2].median = 999;
    const { container } = show(b);
    fireEvent.click(hit(container, 'qi-EC'));
    expect(tipText(container, 'qi')!.lines[0]).toBe('Resultado: 999');
  }));

  it('(6) keyboard: focus shows, arrows/Home/End move the single tab stop', () => guarded(() => {
    const { container } = show(FIXTURE);
    const el = svg(container, 'chart-qi');
    act(() => hit(container, 'qi-V').focus());
    expect(tipText(container, 'qi')!.for).toBe('qi-V');
    const press = (key: string) => fireEvent.keyDown(el, { key });
    press('ArrowRight');
    expect(document.activeElement!.getAttribute('data-tip')).toBe('qi-R');
    expect(tipText(container, 'qi')!.for).toBe('qi-R');
    expect(hit(container, 'qi-R').getAttribute('tabindex')).toBe('0');
    expect(hit(container, 'qi-V').getAttribute('tabindex')).toBe('-1');
    press('End');
    expect(tipText(container, 'qi')!.for).toBe('qi-VP');
    press('Home');
    expect(tipText(container, 'qi')!.for).toBe('qi-V');
    press('ArrowLeft');
    expect(document.activeElement!.getAttribute('data-tip')).toBe('qi-V');
    expect(tipText(container, 'qi')!.for).toBe('qi-V');
  }));

  it('(7) a null payload has no targets and no tooltip', () => guarded(() => {
    const { container } = show(null);
    expect(container.querySelectorAll('.tip-hit')).toHaveLength(0);
    expect(container.querySelectorAll('[data-testid^="chart-tip-"]')).toHaveLength(0);
  }));
});
