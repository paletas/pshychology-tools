import type { IndexName, Snapshot } from './types';

export interface BoxPlotEntry {
  label: string;
  min: number | null;
  max: number | null;
  q1: number | null;
  q3: number | null;
  median: number | null;
}

export interface ChartPayloads {
  standardResults: { Labels: string[]; Verbal: (number | null)[]; Realization: (number | null)[] };
  factorial: { Labels: string[]; VerbalComprehension: (number | null)[]; PerceptiveOrganization: (number | null)[]; ProcessingVelocity: (number | null)[] };
  qi: { QI: BoxPlotEntry[]; Indices: BoxPlotEntry[] };
}

const nulls = (n: number) => Array<number | null>(n).fill(null);

/**
 * Same JSON the old app passes to wisc3.draw*, except factorial VerbalComprehension has 10 entries
 * (the old one has 13 against 10 labels). Null when the indices are not shown.
 */
export function chartPayloads(s: Snapshot, pt: Record<string, string>): ChartPayloads | null {
  if (!s.indicesShown) return null;
  const col = (id: string, c: number): number | null => s.tests[id]?.scaled[c] ?? null;

  const standardResults = {
    Labels: ['Inf', 'Sem', 'Ari', 'Voc', 'Com', 'MD', 'CG', 'Cd', 'DG', 'Cb', 'CO', 'PS', 'Lb'],
    Verbal: [
      ...['Information', 'Similarities', 'Arithmetic', 'Vocabulary', 'Comprehension', 'DigitMemory'].map((id) => col(id, 0)),
      ...nulls(7),
    ],
    Realization: [
      ...nulls(6),
      ...['ImageCompletion', 'Code', 'ImageDisposition', 'Cubes', 'ObjectComposition', 'SymbolSearch', 'Labyrinth'].map((id) => col(id, 1)),
    ],
  };

  const factorial = {
    Labels: ['Inf', 'Sem', 'Voc', 'Com', 'CG', 'DG', 'Cb', 'CO', 'Cd', 'PS'],
    VerbalComprehension: [...['Information', 'Similarities', 'Vocabulary', 'Comprehension'].map((id) => col(id, 2)), ...nulls(6)],
    PerceptiveOrganization: [
      ...nulls(4),
      ...['ImageCompletion', 'ImageDisposition', 'Cubes', 'ObjectComposition'].map((id) => col(id, 1)),
      ...nulls(2),
    ],
    ProcessingVelocity: [...nulls(8), ...['Code', 'SymbolSearch'].map((id) => col(id, 1))],
  };

  const box = (name: IndexName, ptKey: string): BoxPlotEntry => {
    const e = s.indices[name]?.entry;
    const label = pt[`QI.${ptKey}`];
    if (!e || e === 'unavailable') return { label, min: null, max: null, q1: null, q3: null, median: null };
    return { label, min: e.ci95[0], max: e.ci95[1], q1: e.ci90[0], q3: e.ci90[1], median: e.iq };
  };

  return {
    standardResults,
    factorial,
    qi: {
      QI: [box('verbal', 'Verbal'), box('realization', 'Realization'), box('completeScale', 'CompleteScale')],
      Indices: [
        box('verbalComprehension', 'VerbalComprehension'),
        box('perceptiveOrganization', 'PerceptiveOrganization'),
        box('processingVelocity', 'ProcessingVelocity'),
      ],
    },
  };
}
