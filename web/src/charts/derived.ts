import type { ChartPayloads } from '../engine/charts';

export type FactorKey = 'CV' | 'OP' | 'VP';

/** Display-only values derived from the chart payloads (the payloads themselves are not changed). */
export interface ChartsDerived {
  factorMeans: Record<FactorKey, number | null>;
}

const mean = (values: (number | null)[]): number | null => {
  const v = values.filter((x): x is number => x !== null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Mean of the scored subtests in each factor group (null when none is scored). */
export function chartsDerived(p: ChartPayloads | null): ChartsDerived | null {
  if (!p) return null;
  const f = p.factorial;
  return {
    factorMeans: {
      CV: mean(f.VerbalComprehension.slice(0, 4)),
      OP: mean(f.PerceptiveOrganization.slice(4, 8)),
      VP: mean(f.ProcessingVelocity.slice(8, 10)),
    },
  };
}
