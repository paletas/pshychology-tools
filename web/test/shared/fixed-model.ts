// Test-only. Never imported by src/.
// Prediction of what the NEW app must show for a case, derived from the old app's recorded outcome plus
// the deliberate fixes (3 tags). Since REV-11 the old app already holds the approved table corrections, so there is no manual-correction tag.
// The key sets come from the oracle golden indices, never from data/.
import type { Age, CaseInput, IndexName, IndexSnapshot, Snapshot, TestSnapshot } from '../../src/engine/types';
import { INDEX_NAMES } from '../../src/engine/types';

export const TEST_IDS = [
  'ImageCompletion', 'Information', 'Code', 'Similarities', 'ImageDisposition', 'Arithmetic', 'Cubes',
  'Vocabulary', 'ObjectComposition', 'Comprehension', 'SymbolSearch', 'DigitMemory', 'Labyrinth',
] as const;

export type Tag = 'gate-low' | 'gate-high-throw' | 'index-missing-key';

export interface OldIndex {
  sum: number | null;
  iq: number | null;
  percentile: string | null;
  ci90: [number, number] | null;
  ci95: [number, number] | null;
  comparison: string | null;
}

export interface OldResult {
  age: Age | null;
  throws: boolean;
  supported: boolean;
  tests: Record<string, { min: number | null; max: number | null; scaled: (number | null)[]; outOfBounds: boolean }> | null;
  sums: Snapshot['sums'] | null;
  indicesShown: boolean;
  indices: Record<string, OldIndex | null> | null;
  charts: any;
  throwStage: 'age' | 'raw' | null;
  throwAt: { test: string; raw: number } | null;
  bandId: string | null;
}

// One row per corrected cell (golden/corrections.json). Scaled rows: band/age/test/raw, old {throws}|{scaled}, corrected = 5 columns.
// Index rows: index/sum/field, old and corrected values (percentile as string), oldRow.
export interface GoldenCorrection {
  id: string;
  kind: 'scaled' | 'index';
  band?: string;
  test?: string;
  raw?: number;
  index?: string;
  sum?: number;
  field?: 'iq' | 'percentile' | 'ci95Lower' | 'ci95Upper';
  old: any;
  corrected: any;
}

export type KeySets = Record<IndexName, Set<number>>;

export interface ExpectedCase extends Snapshot {
  charts: any | null;
}

const lex = (a: Age, b: Age) => {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
};
const strictlySupported = (a: Age | null) => a !== null && lex(a, [6, 0, 0]) >= 0 && lex(a, [17, 0, 0]) < 0;

function blocked(age: Age | null): ExpectedCase {
  const tests: Record<string, TestSnapshot> = {};
  for (const id of TEST_IDS) tests[id] = { min: null, max: null, scaled: [null, null, null, null, null], outOfBounds: false, ok: false };
  const indices = Object.fromEntries(INDEX_NAMES.map((n) => [n, null])) as Record<IndexName, IndexSnapshot | null>;
  return {
    age, supported: false, bandId: null, tests,
    sums: { verbal: 0, realization: 0, verbalComprehension: 0, perceptiveOrganization: 0, processingVelocity: 0, complete: 0 },
    indicesShown: false, indices, charts: null,
  };
}

const QI_CHART_POS: Partial<Record<IndexName, ['QI' | 'Indices', number]>> = {
  verbal: ['QI', 0], realization: ['QI', 1], completeScale: ['QI', 2],
  verbalComprehension: ['Indices', 0], perceptiveOrganization: ['Indices', 1], processingVelocity: ['Indices', 2],
};

export function fixedModel(
  input: CaseInput,
  old: OldResult,
  keySets: KeySets,
): { expected: ExpectedCase; tags: Tag[] } {
  const tags: Tag[] = [];
  if (!strictlySupported(old.age)) {
    if (old.throws && old.throwStage === 'age') tags.push('gate-high-throw');
    else if (old.supported && !old.throws) tags.push('gate-low');
    return { expected: blocked(old.age), tags };
  }

  const base = old;
  if (old.throws && old.throwStage === 'raw') throw new Error('unexpected old raw-stage throw');
  if (old.throws) throw new Error('unexpected old throw for a supported age');

  const tests: Record<string, TestSnapshot> = {};
  for (const id of TEST_IDS) {
    const t = base.tests![id];
    const raw = input.raw[id] ?? null;
    tests[id] = {
      min: t.min, max: t.max, scaled: t.scaled as TestSnapshot['scaled'], outOfBounds: t.outOfBounds,
      ok: raw !== null && !t.outOfBounds,
    };
  }

  const charts = base.charts ? JSON.parse(JSON.stringify(base.charts)) : null;
  const indices = {} as Record<IndexName, IndexSnapshot | null>;
  let missing = false;
  for (const n of INDEX_NAMES) {
    const e = base.indices?.[n] ?? null;
    if (!base.indicesShown || !e) {
      indices[n] = null;
      continue;
    }
    if (!keySets[n].has(e.sum as number)) {
      indices[n] = { sum: e.sum as number, entry: 'unavailable' };
      missing = true;
      const [grp, i] = QI_CHART_POS[n]!;
      const box = charts.qi[grp][i];
      box.min = box.max = box.q1 = box.q3 = box.median = null;
    } else {
      indices[n] = {
        sum: e.sum as number,
        entry: { iq: e.iq as number, percentile: Number(e.percentile), ci90: e.ci90!, ci95: e.ci95! },
      };
    }
  }
  if (missing) tags.push('index-missing-key');

  return {
    expected: {
      age: base.age, supported: true, bandId: base.bandId, tests, sums: base.sums!,
      indicesShown: base.indicesShown, indices, charts,
    },
    tags,
  };
}

/** Charts as label -> value maps; entries beyond the labels must be null and are ignored. */
export function chartsToMaps(c: any | null): any | null {
  if (!c) return null;
  const toMap = (labels: string[], arr: (number | null)[]) => {
    const m: Record<string, number | null> = {};
    labels.forEach((l, i) => (m[l] = arr[i] ?? null));
    for (let i = labels.length; i < arr.length; i++) if (arr[i] !== null) throw new Error('non-null value beyond labels');
    return m;
  };
  return {
    standardResults: {
      Verbal: toMap(c.standardResults.Labels, c.standardResults.Verbal),
      Realization: toMap(c.standardResults.Labels, c.standardResults.Realization),
    },
    factorial: {
      VerbalComprehension: toMap(c.factorial.Labels, c.factorial.VerbalComprehension),
      PerceptiveOrganization: toMap(c.factorial.Labels, c.factorial.PerceptiveOrganization),
      ProcessingVelocity: toMap(c.factorial.Labels, c.factorial.ProcessingVelocity),
    },
    qi: c.qi,
  };
}
