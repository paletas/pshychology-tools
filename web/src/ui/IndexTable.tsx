import { comparisonBand, formatCi, formatPercentile } from '../engine/format';
import type { ComparisonBand } from '../engine/format';
import { INDEX_NAMES } from '../engine/types';
import type { IndexName, Snapshot } from '../engine/types';
import { pt } from '../i18n/pt';

export type CiChoice = 'Percentil90' | 'Percentil95';

const ARROWS: Record<ComparisonBand, string> = {
  ExtremelyBelow: 'M19 15l-7 7l-7-7m14-5l-7 7l-7-7m14-5l-7 7l-7-7',
  FarBelow: 'M19 13l-7 7-7-7m14-8l-7 7-7-7',
  Below: 'M19 9l-7 7-7-7',
  OnAverage: 'M16 12l-9 0M16 9l-9 0',
  Above: 'M5 15l7-7 7 7',
  FarAbove: 'M5 11l7-7 7 7M5 19l7-7 7 7',
  ExtremelyAbove: 'M5 11l7-7l7 7M5 16l7-7l7 7M5 21l7-7l7 7',
};

const UNAVAILABLE_TITLE = 'Soma fora da tabela de conversão';

const LABEL_KEY: Record<IndexName, string> = {
  verbal: 'Verbal',
  realization: 'Realization',
  completeScale: 'CompleteScale',
  verbalComprehension: 'VerbalComprehension',
  perceptiveOrganization: 'PerceptiveOrganization',
  processingVelocity: 'ProcessingVelocity',
};

interface Props {
  snapshot: Snapshot;
  ci: CiChoice;
  onCi: (v: CiChoice) => void;
}

export function IndexTable({ snapshot, ci, onCi }: Props) {
  return (
    <table className="table-fixed rounded-xl bg-gray-600 border-gray-600 border-separate">
      <thead className="text-white">
        <tr>
          <td className="w-2/6"></td>
          <td className="w-1/6 uppercase font-bold">{pt['TestsPatternResults']}</td>
          <td className="w-1/6 uppercase font-bold">{pt['QI']}</td>
          <td className="w-1/6 uppercase font-bold">{pt['Percentil']}</td>
          <td className="w-1/6 uppercase font-bold">{pt['ConfidenceInterval']}</td>
        </tr>
        <tr>
          <td></td>
          <td className="uppercase font-bold"></td>
          <td className="uppercase font-bold"></td>
          <td className="uppercase font-bold"></td>
          <td className="uppercase font-bold">
            <select className="bg-gray-600 text-white text-xs" data-testid="ci-select" value={ci} onChange={(e) => onCi(e.target.value as CiChoice)}>
              <option value="Percentil90">{pt['literal.2']}</option>
              <option value="Percentil95">{pt['literal.3']}</option>
            </select>
          </td>
        </tr>
      </thead>
      <tbody>
        {INDEX_NAMES.map((name) => {
          const row = snapshot.indices[name];
          const entry = row?.entry;
          const ok = entry && entry !== 'unavailable' ? entry : null;
          const unavailable = entry === 'unavailable';
          const band = ok ? comparisonBand(ok.iq) : null;
          const ciValue = ok ? (ci === 'Percentil90' ? ok.ci90 : ok.ci95) : null;
          const titleProps = unavailable ? { title: UNAVAILABLE_TITLE } : {};
          return (
            <tr key={name} data-testid={`index-row-${name}`}>
              <td className="uppercase text-white font-bold">{pt[`QI.${LABEL_KEY[name]}`]}</td>
              <td className="bg-gray-200" data-testid={`index-sum-${name}`}>{row ? row.sum : ''}</td>
              <td className="bg-gray-200" {...titleProps}>
                <span data-testid={`index-iq-${name}`}>{unavailable ? '—' : ok ? ok.iq : ''}</span>
                {band && (
                  <svg className="w-8 h-8 float-right" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-testid={`index-class-${name}`}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ARROWS[band]} />
                    <title>{pt[`QI.AverageComparison.${band}`]}</title>
                  </svg>
                )}
              </td>
              <td className="bg-gray-200" data-testid={`index-pct-${name}`} {...titleProps}>
                {unavailable ? '—' : ok ? formatPercentile(ok.percentile) : ''}
              </td>
              <td className="bg-gray-200" data-testid={`index-ci-${name}`} {...titleProps}>
                {unavailable ? '—' : formatCi(ciValue)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
