import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { installDebug } from '../../src/debug';
import { scoreCase } from '../../src/engine/scoring';
import { pt } from '../../src/i18n/pt';
import { ptNew } from '../../src/i18n/pt-new';
import { guardText } from '../../src/ui/guards/inputGuards';
import { fmt } from '../../src/ui/template';
import type { RefData } from '../../src/engine/types';
import { parseBundle } from '../../src/refdata/schema';
import { birthFor } from '../shared/load';

// Reference data comes from the precached baseline, as in the app; the client module is mocked.
const baselineText = readFileSync(resolve(__dirname, '../../public/reference/baseline.json'), 'utf8');
const data: RefData = parseBundle(baselineText);

vi.mock('../../src/refdata/client', () => ({
  initReferenceData: async () => ({
    current: { data: parseBundle(readFileSync(resolve(__dirname, '../../public/reference/baseline.json'), 'utf8')), sha: 'test-sha' },
    onPending: () => {},
    updated: Promise.resolve(),
  }),
  takePending: () => null,
}));

const TEST_DATE = '2026-10-03';
const COLUMNS = ['verbal', 'realization', 'verbalComprehension', 'perceptiveOrganization', 'processingVelocity'] as const;

beforeAll(() => {
  installDebug();
  // jsdom has no canvas
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});

beforeEach(() => {
  vi.spyOn(Storage.prototype, 'setItem');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function renderApp() {
  render(<App />);
  await waitFor(() => expect(screen.getByTestId('app').getAttribute('data-ready')).toBe('true'));
}

function setAge(age: [number, number, number]) {
  fireEvent.change(document.getElementById('testDate')!, { target: { value: TEST_DATE } });
  fireEvent.change(document.getElementById('subjectBirthday')!, { target: { value: birthFor(TEST_DATE, age) } });
}

function setRaw(testId: string, value: number | string) {
  fireEvent.change(screen.getByTestId(`raw-${testId}`), { target: { value: String(value) } });
}

/** mid-range raw for every test of the band of the given age */
function midRaws(age: [number, number, number]): Record<string, number> {
  const snap = scoreCase(data, { testDate: TEST_DATE, birthDate: birthFor(TEST_DATE, age), raw: {} });
  const out: Record<string, number> = {};
  for (const [id, t] of Object.entries(snap.tests)) out[id] = Math.floor((t.min! + t.max!) / 2);
  return out;
}

const text = (id: string) => screen.getByTestId(id).textContent;
const oobs = () => document.querySelectorAll('[data-testid^="oob-"]');

describe('App', () => {
  it('renders the IQs from scoreCase for a full case', async () => {
    await renderApp();
    const age: [number, number, number] = [9, 3, 12];
    setAge(age);
    const raw = midRaws(age);
    for (const [id, v] of Object.entries(raw)) setRaw(id, v);

    const snap = scoreCase(data, { testDate: TEST_DATE, birthDate: birthFor(TEST_DATE, age), raw });
    expect(snap.indicesShown).toBe(true);
    for (const [name, row] of Object.entries(snap.indices)) {
      expect(text(`index-sum-${name}`)).toBe(String(row!.sum));
      if (row!.entry !== 'unavailable') expect(text(`index-iq-${name}`)).toBe(String(row!.entry.iq));
    }
    expect(text('sum-complete')).toBe(String(snap.sums.complete));
    expect(window.__wisc3Debug.snapshot().snapshot).toEqual(snap);
    expect(window.__wisc3Debug.snapshot().charts).not.toBeNull();
    expect(text('data-version')).toBe(`Dados: ${data.dataVersion}`);
  });

  it('clearing one mandatory raw clears all index cells and charts', async () => {
    await renderApp();
    const age: [number, number, number] = [9, 3, 12];
    setAge(age);
    for (const [id, v] of Object.entries(midRaws(age))) setRaw(id, v);
    expect(window.__wisc3Debug.snapshot().charts).not.toBeNull();

    setRaw('Information', '');
    for (const name of ['verbal', 'realization', 'completeScale', 'verbalComprehension', 'perceptiveOrganization', 'processingVelocity']) {
      expect(screen.queryByTestId(`index-row-${name}`)).toBeNull();
    }
    expect(window.__wisc3Debug.snapshot().snapshot!.indicesShown).toBe(false);
    expect(window.__wisc3Debug.snapshot().charts).toBeNull();
  });

  it('age 5y10m0d shows the blocked state', async () => {
    await renderApp();
    setAge([5, 10, 0]);
    expect(text('age-years')).toBe('5');
    expect(text('age-months')).toBe('10');
    expect(text('age-days')).toBe('0');
    expect(screen.queryByTestId('norm-band')).toBeNull();
    const input = screen.getByTestId('raw-Information');
    expect(input.hasAttribute('min')).toBe(false);
    expect(input.hasAttribute('max')).toBe(false);
    setRaw('Information', 5);
    expect(text('scaled-Information')).toBe('');
    expect(text('sum-complete')).toBe('0');
    expect(screen.queryByTestId('index-row-verbal')).toBeNull();
    expect(screen.getByTestId('results-empty').getAttribute('data-reason')).toBe('results.empty.age');
    expect(window.__wisc3Debug.snapshot().snapshot!.supported).toBe(false);
  });

  it('shows the PV row as unavailable for Coding scaled 1 without Symbol Search', async () => {
    await renderApp();
    const age: [number, number, number] = [9, 3, 12];
    setAge(age);
    const raw = midRaws(age);
    delete (raw as Record<string, number>).SymbolSearch;
    const band = scoreCase(data, { testDate: TEST_DATE, birthDate: birthFor(TEST_DATE, age), raw: {} }).bandId!;
    raw.Code = data.subtests[band].Code.scaled['1'][0];
    for (const [id, v] of Object.entries(raw)) setRaw(id, v);

    expect(text('scaled-Code')).toBe('1');
    expect(screen.getByTestId('scaled-Code').getAttribute('data-columns')).toBe('realization,processingVelocity');
    expect(text('index-sum-processingVelocity')).toBe('1');
    expect(text('index-iq-processingVelocity')).toBe('—');
    expect(text('index-pct-processingVelocity')).toBe('—');
    expect(text('index-ci-processingVelocity')).toBe('—');
    expect(screen.getByTestId('index-pct-processingVelocity').getAttribute('title')).toBe('Soma fora da tabela de conversão');
    expect(screen.queryByTestId('index-class-processingVelocity')).toBeNull();
  });

  it('[C1] age 11y8m0d with ImageDisposition=38 shows 13 in realization and perceptiveOrganization', async () => {
    await renderApp();
    setAge([11, 8, 0]);
    setRaw('ImageDisposition', 38);
    expect(text('scaled-ImageDisposition')).toBe('13');
    expect(screen.getByTestId('scaled-ImageDisposition').getAttribute('data-columns')).toBe('realization,perceptiveOrganization');
  });

  it('out-of-bounds raw shows one inline message with the resx text', async () => {
    await renderApp();
    const age: [number, number, number] = [9, 3, 12];
    setAge(age);
    const t = scoreCase(data, { testDate: TEST_DATE, birthDate: birthFor(TEST_DATE, age), raw: {} }).tests.Information;
    setRaw('Information', t.max! + 1);
    expect(oobs()).toHaveLength(1);
    expect(text('oob-Information')).toBe(`Resultado bruto está fora do intervalo de valores esperados (${t.min} - ${t.max})`);
    expect(screen.getByTestId('raw-Information').getAttribute('aria-invalid')).toBe('true');
  });

  it('never writes to localStorage or sessionStorage', async () => {
    await renderApp();
    const age: [number, number, number] = [9, 3, 12];
    setAge(age);
    for (const [id, v] of Object.entries(midRaws(age))) setRaw(id, v);
    fireEvent.click(screen.getByTestId('start-fresh'));
    expect(Storage.prototype.setItem).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('renders the redesigned page shell (REV-9)', async () => {
    await renderApp();
    const link = document.querySelector('header.topbar nav a')!;
    expect(link.textContent).toBe('WISC-III');
    expect(link.getAttribute('href')).toBe('wisc3');
    expect(document.querySelector('h1')!.textContent).toBe('WISC-III');
    const footer = document.querySelector('footer')!;
    expect(footer.textContent).toContain(pt['Language'] + ': ' + pt['Language.pt-PT']);
    expect(document.querySelector('.notice')!.textContent).toContain(pt['Warning']);
    expect(document.querySelectorAll('img[src^="http"]')).toHaveLength(0);
  });

  it('the menu button toggles aria-expanded and the open class of #main-nav', async () => {
    await renderApp();
    const nav = document.getElementById('main-nav')!;
    const menu = document.querySelector('button.menu')!;
    expect(menu.getAttribute('aria-controls')).toBe('main-nav');
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    expect(nav.classList.contains('open')).toBe(false);
    fireEvent.click(menu);
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    expect(nav.classList.contains('open')).toBe(true);
    fireEvent.click(menu);
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    expect(nav.classList.contains('open')).toBe(false);
  });

  it('lists the subtests in administration order', async () => {
    await renderApp();
    const ids = Array.from(document.querySelectorAll('[data-testid^="subtest-row-"]')).map((e) => e.getAttribute('data-testid')!.slice('subtest-row-'.length));
    expect(ids).toEqual(['ImageCompletion', 'Information', 'Code', 'Similarities', 'ImageDisposition', 'Arithmetic', 'Cubes', 'Vocabulary', 'ObjectComposition', 'Comprehension', 'SymbolSearch', 'DigitMemory', 'Labyrinth']);
    expect(ids).toEqual(data.tests.map((t) => t.id));
    expect(screen.getByTestId('subtest-row-SymbolSearch').textContent).toContain('(opcional)');
    expect(screen.getByTestId('subtest-row-Code').textContent).not.toContain('(opcional)');
  });

  it('has no out-of-bounds message before input and exactly one for a raw above the maximum', async () => {
    await renderApp();
    expect(oobs()).toHaveLength(0);
    setAge([9, 3, 12]);
    expect(oobs()).toHaveLength(0);
    const t = window.__wisc3Debug.snapshot().snapshot!.tests.Information;
    setRaw('Information', String(t.max! + 1));
    expect(oobs()).toHaveLength(1);
    setRaw('Information', String(t.max));
    expect(oobs()).toHaveLength(0);
  });

  it('shows the live day-count age sentence and the norm band line', async () => {
    await renderApp();
    expect(text('age')).toBe('Introduza a data de nascimento e a data do teste.');
    setAge([9, 3, 12]);
    const snap = window.__wisc3Debug.snapshot().snapshot!;
    expect(snap.age).toEqual([9, 3, 12]);
    expect(text('age-years')).toBe('9');
    expect(text('age-months')).toBe('3');
    expect(text('age-days')).toBe('12');
    expect(screen.getByTestId('age').textContent).toContain('9 anos, 3 meses e 12 dias');
    expect(text('norm-band')).toBe('Tabela de normas dos 9 anos');
    setAge([11, 8, 0]);
    expect(text('norm-band')).toBe('Tabela de normas dos 11 anos e meio');
    expect(document.getElementById('subjectAgeYear')).toBeNull();
  });

  it('shows the empty results state until all mandatory raws are in, and the glance strip after', async () => {
    await renderApp();
    expect(screen.getByTestId('results-empty')).toBeTruthy();
    expect(document.getElementById('glance')!.textContent!.match(/—/g)).toHaveLength(3);
    const age: [number, number, number] = [9, 3, 12];
    setAge(age);
    for (const [id, v] of Object.entries(midRaws(age))) setRaw(id, v);
    expect(screen.queryByTestId('results-empty')).toBeNull();
    expect(document.querySelectorAll('[data-testid="strip"]').length).toBeGreaterThan(0);
    const snap = window.__wisc3Debug.snapshot().snapshot!;
    const iq = (n: 'verbal' | 'realization' | 'completeScale') => { const e = snap.indices[n]!.entry; return e === 'unavailable' ? '—' : String(e.iq); };
    expect(document.getElementById('glance')!.children).toHaveLength(3);
    expect(text('glance-verbal')).toContain(iq('verbal'));
    expect(text('glance-completeScale')).toContain(iq('completeScale'));
  });

  it('the 90/95 switch changes the interval shown and data-ci marks the pressed button', async () => {
    await renderApp();
    const age: [number, number, number] = [9, 3, 12];
    setAge(age);
    for (const [id, v] of Object.entries(midRaws(age))) setRaw(id, v);
    const snap = window.__wisc3Debug.snapshot().snapshot!;
    const e = snap.indices.verbal!.entry;
    if (e === 'unavailable') throw new Error('expected an available verbal index');
    const pressed = () => document.querySelector('[data-testid="ci-select"] [aria-pressed="true"]')!.getAttribute('data-ci');
    expect(pressed()).toBe('95');
    expect(text('index-ci-verbal')).toBe(`${e.ci95[0]} - ${e.ci95[1]}`);
    fireEvent.click(document.querySelector('[data-testid="ci-select"] [data-ci="90"]')!);
    expect(pressed()).toBe('90');
    expect(text('index-ci-verbal')).toBe(`${e.ci90[0]} - ${e.ci90[1]}`);
  });

  it('Imprimir calls window.print and the sums keep their test ids', async () => {
    await renderApp();
    const spy = vi.fn();
    window.print = spy as never;
    fireEvent.click(screen.getByTestId('print'));
    expect(spy).toHaveBeenCalledTimes(1);
    for (const k of [...COLUMNS, 'complete']) expect(screen.getByTestId(`sum-${k}`)).toBeTruthy();
  });
});

describe('[REV-15] raw field affordance', () => {
  it('13 boxed text inputs with the dash placeholder and an accessible name', async () => {
    const errorSpy = vi.spyOn(console, 'error');
    await renderApp();
    const inputs = document.querySelectorAll<HTMLInputElement>('input[data-testid^="raw-"]');
    expect(inputs.length).toBe(13);
    for (const el of inputs) {
      const id = el.getAttribute('data-testid')!.slice('raw-'.length);
      expect(el.getAttribute('type')).toBe('text');
      expect(el.getAttribute('inputmode')).toBe('numeric');
      expect(el.getAttribute('placeholder')).toBe('–');
      expect(el.value).toBe('');
      expect(screen.getByRole('textbox', { name: fmt(ptNew['raw.aria'], pt[`Test.${id}`]) })).toBe(el);
    }
    expect(errorSpy).toHaveBeenCalledTimes(0);
  });

  it('the Resultados Brutos header comes before the list', async () => {
    const errorSpy = vi.spyOn(console, 'error');
    await renderApp();
    const head = screen.getByTestId('tests-head');
    expect(head.textContent).toBe(pt['TestsRawResults']);
    const ul = document.querySelector('ul.tests')!;
    expect(head.compareDocumentPosition(ul) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(errorSpy).toHaveBeenCalledTimes(0);
  });

  it('the scaled cells are read-only spans, not inputs', async () => {
    const errorSpy = vi.spyOn(console, 'error');
    await renderApp();
    const cells = document.querySelectorAll('[data-testid^="scaled-"]');
    expect(cells.length).toBe(13);
    for (const c of cells) {
      expect(c.tagName).toBe('SPAN');
      expect(c.hasAttribute('placeholder')).toBe(false);
    }
    expect(errorSpy).toHaveBeenCalledTimes(0);
  });

  it('guard messages are unchanged (12.5 is still raw.invalid)', async () => {
    const errorSpy = vi.spyOn(console, 'error');
    await renderApp();
    setAge([9, 3, 12]);
    const first = document.querySelector<HTMLInputElement>('input[data-testid^="raw-"]')!;
    const id = first.getAttribute('data-testid')!.slice('raw-'.length);
    setRaw(id, '12.5');
    const msg = screen.getByTestId(`raw-msg-${id}`);
    expect(msg.getAttribute('data-key')).toBe('raw.invalid');
    expect(msg.textContent).toContain(guardText('raw.invalid'));
    expect(errorSpy).toHaveBeenCalledTimes(0);
  });
});
