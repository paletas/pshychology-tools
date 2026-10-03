/** Percentile formatted like C# decimal.ToString() in the browser culture. */
export function formatPercentile(p: number, locale: string = navigator.language): string {
  return new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 20 }).format(p);
}

export function formatCi(ci: [number, number] | null | undefined): string {
  return ci ? `${ci[0]} - ${ci[1]}` : ' - ';
}

export type ComparisonBand = 'ExtremelyBelow' | 'FarBelow' | 'Below' | 'OnAverage' | 'Above' | 'FarAbove' | 'ExtremelyAbove';

/** Classification of an IQ, as in WISC3CalculatedQIViewModel.cs:19-27 (ranges are inclusive). */
export function comparisonBand(iq: number): ComparisonBand {
  if (iq <= 69) return 'ExtremelyBelow';
  if (iq <= 79) return 'FarBelow';
  if (iq <= 89) return 'Below';
  if (iq <= 109) return 'OnAverage';
  if (iq <= 119) return 'Above';
  if (iq <= 129) return 'FarAbove';
  return 'ExtremelyAbove';
}
