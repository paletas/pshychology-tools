import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { installDebug } from '../../src/debug';
import { dayCountAge } from '../../src/engine/age';
import { lookupGrid } from '../../src/engine/bands';
import type { RefData } from '../../src/engine/types';
import { parseBundle } from '../../src/refdata/schema';
import { formatRange } from '../../src/ui/LookupDialog';

vi.mock('../../src/refdata/client', () => ({
  initReferenceData: async () => ({
    current: { data: parseBundle(readFileSync(resolve(__dirname, '../../public/reference/baseline.json'), 'utf8')), sha: 'test-sha' },
    onPending: () => {},
    updated: Promise.resolve(),
  }),
  takePending: () => null,
}));

const data: RefData = parseBundle(readFileSync(resolve(__dirname, '../../public/reference/baseline.json'), 'utf8'));
const NOW = new Date('2026-10-03T10:00:00');
const TEST = '2026-10-03';
const IDS = ['Information', 'Similarities', 'Arithmetic', 'Vocabulary', 'Comprehension', 'DigitMemory', 'ImageCompletion', 'Code', 'ImageDisposition', 'Cubes', 'ObjectComposition', 'SymbolSearch', 'Labyrinth'];

/** A birth date for which the engine's day-count age at TEST is exactly `age`. */
function birthFor(age: [number, number, number]): string {
  const [ty, tm, td] = TEST.split('-').map(Number);
  for (let i = 0; i < 9000; i++) {
    const iso = new Date(Date.UTC(ty - age[0] - 1, tm - 1 - age[1], td - 40 + i)).toISOString().slice(0, 10);
    const a = dayCountAge(TEST, iso);
    if (a && a[0] === age[0] && a[1] === age[1] && a[2] === age[2]) return iso;
  }
  throw new Error('no birth date');
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeAll(() => installDebug());
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  errorSpy = vi.spyOn(console, 'error');
});
afterEach(() => {
  expect(errorSpy).not.toHaveBeenCalled();
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function renderApp() {
  render(<App />);
  await waitFor(() => expect(screen.getByTestId('app').getAttribute('data-ready')).toBe('true'));
}
const setDates = (birth: string, test: string) => {
  fireEvent.change(document.getElementById('subjectBirthday')!, { target: { value: birth } });
  fireEvent.change(document.getElementById('testDate')!, { target: { value: test } });
};
const setRaw = (id: string, v: string) => fireEvent.change(screen.getByTestId(`raw-${id}`), { target: { value: v } });
const openTable = () => fireEvent.click(screen.getByTestId('show-table'));
const dialog = () => screen.getByTestId('lookup-dialog') as HTMLDialogElement;

describe('formatRange', () => {
  it('formats single values, ranges and gaps', () => {
    expect(formatRange(null)).toBe('');
    expect(formatRange(undefined)).toBe('');
    expect(formatRange([7, 7])).toBe('7');
    expect(formatRange([0, 9])).toBe('0 - 9');
  });
});

describe('lookup dialog', () => {
  it('is closed until Ver Tabela is pressed and closes again (button, backdrop)', async () => {
    await renderApp();
    expect(dialog().hasAttribute('open')).toBe(false);
    openTable();
    expect(dialog().hasAttribute('open')).toBe(true);
    fireEvent.click(screen.getByTestId('lookup-close'));
    await waitFor(() => expect(dialog().hasAttribute('open')).toBe(false));
    openTable();
    fireEvent.click(dialog());
    await waitFor(() => expect(dialog().hasAttribute('open')).toBe(false));
    expect(dialog().getAttribute('aria-labelledby')).toBe('lk-title');
  });

  it.each([
    ['dates missing', '', ''],
    ['test date before birth date (dates guard not ok)', '2020-01-01', '2019-01-01'],
    ['age below 6 (age-out)', birthFor([4, 0, 0]), TEST],
  ])('REV-12: %s shows lookup-empty and no table', async (_n, birth, test) => {
    await renderApp();
    if (birth || test) setDates(birth, test);
    openTable();
    expect(screen.getByTestId('lookup-empty').textContent).toBe('Idade fora do intervalo suportado.');
    expect(document.querySelector('[data-testid="lookup-table"]')).toBeNull();
    expect(document.querySelector('[data-testid^="lk-"]')).toBeNull();
  });

  it('shows the 19 x 13 table of the child band, equal to lookupGrid, with the shaded 7-13 band', async () => {
    await renderApp();
    setDates(birthFor([10, 2, 0]), TEST);
    openTable();
    const table = screen.getByTestId('lookup-table');
    expect(table.getAttribute('data-band')).toBe('10y00m');
    expect(document.querySelector('[data-testid="lookup-empty"]')).toBeNull();
    const grid = lookupGrid(data, '10y00m');
    let cells = 0;
    for (const id of IDS) {
      for (let s = 1; s <= 19; s++) {
        expect(screen.getByTestId(`lk-${id}-${s}`).textContent).toBe(formatRange(grid[id][s]));
        cells++;
      }
    }
    expect(cells).toBe(19 * 13);
    expect(table.querySelectorAll('tbody tr')).toHaveLength(19);
    expect(table.querySelectorAll('tbody tr.avg')).toHaveLength(7);
    expect(table.querySelector('caption')!.textContent).toContain('10 anos');
    expect(dialog().querySelector('.lk-sub')!.textContent).toBe('Normas dos 10 anos (10 anos e 0 meses a 10 anos e 5 meses). Resultado bruto para cada resultado padronizado.');
    expect(document.querySelectorAll('[data-hit="true"]')).toHaveLength(0);
  });

  it('marks the cell where the entered raw score falls (wide and narrow views)', async () => {
    await renderApp();
    setDates(birthFor([10, 2, 0]), TEST);
    const grid = lookupGrid(data, '10y00m');
    setRaw('Information', '14');
    setRaw('Code', '30');
    openTable();
    const scaledOf = (id: string, raw: number) => {
      const s = grid[id].findIndex((r) => r && raw >= r[0] && raw <= r[1]);
      expect(s).toBeGreaterThan(0);
      return s;
    };
    const sInfo = scaledOf('Information', 14);
    const sCode = scaledOf('Code', 30);
    const hits = [...document.querySelectorAll('[data-testid^="lk-"][data-hit="true"]')].filter((e) => !(e.getAttribute('data-testid') ?? '').startsWith('lkn-'));
    expect(hits.map((e) => e.getAttribute('data-testid')).sort()).toEqual([`lk-Code-${sCode}`, `lk-Information-${sInfo}`].sort());
    expect(screen.getByTestId(`lk-Information-${sInfo}`).className).toBe('hit');
    // narrow view starts on the first subtest (Information)
    expect(document.querySelectorAll('[data-testid^="lkn-"][data-hit="true"]')).toHaveLength(1);
    expect(screen.getByTestId(`lkn-${sInfo}`).getAttribute('data-hit')).toBe('true');
    expect(dialog().querySelector('.lk-given')!.textContent).toContain(`14, resultado padronizado ${sInfo}`);
  });

  it('narrow view: chips and Anterior/Seguinte move through the 13 subtests with wrap-around', async () => {
    await renderApp();
    setDates(birthFor([10, 2, 0]), TEST);
    setRaw('Code', '30');
    openTable();
    const grid = lookupGrid(data, '10y00m');
    const pressed = () => within(dialog()).getAllByRole('button', { pressed: true, hidden: true }).map((b) => b.getAttribute('data-testid'));
    expect(pressed()).toEqual(['lk-chip-Information']);
    fireEvent.click(screen.getByTestId('lk-prev'));
    expect(pressed()).toEqual(['lk-chip-Labyrinth']);
    fireEvent.click(screen.getByTestId('lk-next'));
    fireEvent.click(screen.getByTestId('lk-next'));
    expect(pressed()).toEqual(['lk-chip-Similarities']);
    fireEvent.click(screen.getByTestId('lk-chip-Code'));
    expect(pressed()).toEqual(['lk-chip-Code']);
    for (let s = 1; s <= 19; s++) expect(screen.getByTestId(`lkn-${s}`).textContent).toBe(`${s}${formatRange(grid.Code[s]) || '—'}`);
    expect(document.querySelectorAll('[data-testid^="lkn-"][data-hit="true"]')).toHaveLength(1);
  });

  it('half-year bands are labelled "e meio"', async () => {
    await renderApp();
    setDates(birthFor([10, 8, 0]), TEST);
    openTable();
    expect(screen.getByTestId('lookup-table').getAttribute('data-band')).toBe('10y06m');
    expect(dialog().querySelector('.lk-sub')!.textContent).toContain('Normas dos 10 anos e meio (10 anos e 6 meses a 10 anos e 11 meses)');
  });
});
