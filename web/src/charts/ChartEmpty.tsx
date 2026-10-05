import { ptNew } from '../i18n/pt-new';

/** Shown in place of a figure while there is no chart payload (REV-12): draws no marks. */
export function ChartEmpty({ kind }: { kind: 'standard' | 'factorial' | 'qi' }) {
  return (
    <p className="empty-state" data-testid={`chart-empty-${kind}`} data-marks="0" role="status">
      {ptNew['chart.empty']}
    </p>
  );
}
