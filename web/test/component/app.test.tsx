import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { installDebug } from '../../src/debug';
import { scoreCase } from '../../src/engine/scoring';
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
      expect(text(`index-sum-${name}`)).toBe('');
      expect(text(`index-iq-${name}`)).toBe('');
      expect(text(`index-pct-${name}`)).toBe('');
    }
    expect(window.__wisc3Debug.snapshot().snapshot!.indicesShown).toBe(false);
    expect(window.__wisc3Debug.snapshot().charts).toBeNull();
  });

  it('age 5y10m0d shows the blocked state', async () => {
    await renderApp();
    setAge([5, 10, 0]);
    expect((document.getElementById('subjectAgeYear') as HTMLInputElement).value).toBe('5');
    expect((document.getElementById('subjectAgeMonth') as HTMLInputElement).value).toBe('10');
    expect((document.getElementById('subjectAgeDay') as HTMLInputElement).value).toBe('0');
    const input = screen.getByTestId('raw-Information');
    expect(input.hasAttribute('min')).toBe(false);
    expect(input.hasAttribute('max')).toBe(false);
    setRaw('Information', 5);
    for (const c of COLUMNS) expect(text(`scaled-Information-${c}`)).toBe('');
    expect(text('sum-complete')).toBe('0');
    expect(text('index-iq-verbal')).toBe('');
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

    expect(text('scaled-Code-processingVelocity')).toBe('1');
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
    expect(text('scaled-ImageDisposition-realization')).toBe('13');
    expect(text('scaled-ImageDisposition-perceptiveOrganization')).toBe('13');
  });

  it('out-of-bounds raw shows the red icon with the resx title', async () => {
    await renderApp();
    const age: [number, number, number] = [9, 3, 12];
    setAge(age);
    const t = scoreCase(data, { testDate: TEST_DATE, birthDate: birthFor(TEST_DATE, age), raw: {} }).tests.Information;
    setRaw('Information', t.max! + 1);
    const svg = screen.getByTestId('subtest-row-Information').querySelector('svg')!;
    expect(svg.getAttribute('class')).not.toContain('hidden');
    expect(svg.querySelector('title')!.textContent).toBe(`Resultado bruto está fora do intervalo de valores esperados (${t.min} - ${t.max})`);
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
});
