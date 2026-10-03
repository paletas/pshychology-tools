import type { Age, IndexName } from '../../../../web/src/engine/types';

export type Cols5 = [string, string, string, string, string];

/** What one app shows for a case, as normalized text (the common form of readers and expectations). */
export interface Reading {
  /** set when the old app crashed (#blazor-error-ui); everything else is then empty */
  crashed: { stage: 'age' | 'raw'; test: string | null } | null;
  age: (number | null)[];
  /** scaled cells by test id (5 columns, '' when empty) */
  scaled: Record<string, Cols5>;
  /** sums: verbal, realization, verbalComprehension, perceptiveOrganization, processingVelocity, complete */
  sums: string[];
  indices: Record<IndexName, ReadIndex>;
  /** chart payloads (old wisc3.draw* points / new debug snapshot charts), null when not drawn */
  charts: any | null;
}

export interface ReadIndex {
  sum: string;
  iq: string;
  cls: string | null;
  pct: string;
  ci90: string;
  ci95: string;
}

export const norm = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
/** CI text: null CI is shown as " - " by both apps. */
export const normCi = (s: string | null | undefined): string => norm(s) || '-';

export function emptyIndex(): ReadIndex {
  return { sum: '', iq: '', cls: null, pct: '', ci90: '-', ci95: '-' };
}

export function emptyReading(crashed: Reading['crashed'] = null): Reading {
  return {
    crashed,
    age: [null, null, null],
    scaled: {},
    sums: ['', '', '', '', '', ''],
    indices: Object.fromEntries(
      (['verbal', 'realization', 'completeScale', 'verbalComprehension', 'perceptiveOrganization', 'processingVelocity'] as IndexName[]).map((n) => [n, emptyIndex()]),
    ) as Reading['indices'],
    charts: null,
  };
}

export const ageOf = (a: Age | null): (number | null)[] => (a ? [...a] : [null, null, null]);

export const LABEL_KEY: Record<IndexName, string> = {
  verbal: 'Verbal',
  realization: 'Realization',
  completeScale: 'CompleteScale',
  verbalComprehension: 'VerbalComprehension',
  perceptiveOrganization: 'PerceptiveOrganization',
  processingVelocity: 'ProcessingVelocity',
};
