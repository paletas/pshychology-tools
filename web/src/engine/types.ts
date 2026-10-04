export type Age = [number, number, number];

export type Column = 'verbal' | 'realization' | 'verbalComprehension' | 'perceptiveOrganization' | 'processingVelocity';

export const COLUMNS: readonly Column[] = ['verbal', 'realization', 'verbalComprehension', 'perceptiveOrganization', 'processingVelocity'];

export type IndexName = 'verbal' | 'realization' | 'completeScale' | 'verbalComprehension' | 'perceptiveOrganization' | 'processingVelocity';

export const INDEX_NAMES: readonly IndexName[] = ['verbal', 'realization', 'completeScale', 'verbalComprehension', 'perceptiveOrganization', 'processingVelocity'];

export interface Band {
  id: string;
  from: Age;
  to: Age;
}

export interface TestDef {
  id: string;
  mandatory: boolean;
  columns: Column[];
}

export interface SubtestTable {
  min: number;
  max: number;
  /** scaled value -> [firstRaw, lastRaw] */
  scaled: Record<string, [number, number]>;
}

export interface IndexEntry {
  iq: number;
  percentile: number;
  ci90: [number, number];
  ci95: [number, number];
}

export interface RefData {
  schemaVersion: number;
  dataVersion: string;
  bands: Band[];
  tests: TestDef[];
  subtests: Record<string, Record<string, SubtestTable>>;
  indices: Record<string, Record<string, IndexEntry>>;
}

/** scaled values in the order verbal, realization, verbalComprehension, perceptiveOrganization, processingVelocity */
export type Scaled = [number | null, number | null, number | null, number | null, number | null];

export interface TestSnapshot {
  min: number | null;
  max: number | null;
  scaled: Scaled;
  outOfBounds: boolean;
  ok: boolean;
}

export interface Sums {
  verbal: number;
  realization: number;
  verbalComprehension: number;
  perceptiveOrganization: number;
  processingVelocity: number;
  complete: number;
}

export type IndexResult = IndexEntry | 'unavailable';

export interface IndexSnapshot {
  sum: number;
  entry: IndexResult;
}

export interface Snapshot {
  age: Age | null;
  supported: boolean;
  bandId: string | null;
  tests: Record<string, TestSnapshot>;
  sums: Sums;
  indicesShown: boolean;
  indices: Record<IndexName, IndexSnapshot | null>;
}

export interface CaseInput {
  testDate: string;
  birthDate: string;
  raw: Record<string, number | null>;
}
