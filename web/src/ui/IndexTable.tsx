import { comparisonBand, formatCi, formatPercentile } from '../engine/format';
import { INDEX_NAMES } from '../engine/types';
import type { IndexName, Snapshot } from '../engine/types';
import { pt } from '../i18n/pt';
import { ptNew } from '../i18n/pt-new';
import { fmt } from './template';

export type CiChoice = 'Percentil90' | 'Percentil95';

const UNAVAILABLE_TITLE = 'Soma fora da tabela de conversão';

const LABEL_KEY: Record<IndexName, string> = {
  verbal: 'Verbal',
  realization: 'Realization',
  completeScale: 'CompleteScale',
  verbalComprehension: 'VerbalComprehension',
  perceptiveOrganization: 'PerceptiveOrganization',
  processingVelocity: 'ProcessingVelocity',
};

// Strip scale: 55..145 with the 85-115 band, as in the design mock.
const LO = 55;
const HI = 145;
const W = 600;
const TICKS = [70, 85, 100, 115, 130];
const clampIq = (v: number) => Math.min(HI, Math.max(LO, v));
const sx = (v: number) => ((clampIq(v) - LO) / (HI - LO)) * W;

/** One index drawn on the 55..145 scale: confidence-interval bar and a mark for the IQ (999 and out-of-scale values are pinned to the edge). */
function Strip({ iq, ci }: { iq: number; ci: [number, number] | null }) {
  return (
    <svg className="strip" viewBox={`0 0 ${W} 34`} preserveAspectRatio="none" aria-hidden="true" data-testid="strip">
      <rect x={sx(85)} y="2" width={sx(115) - sx(85)} height="30" fill="var(--band)" />
      {TICKS.map((v) => <line key={v} x1={sx(v)} x2={sx(v)} y1="6" y2="28" stroke="var(--line)" />)}
      {ci && <rect x={sx(ci[0])} y="11" width={Math.max(0, sx(ci[1]) - sx(ci[0]))} height="12" rx="6" fill="var(--petrol-soft)" opacity=".55" />}
      <rect x={sx(iq) - 2} y="5" width="4" height="24" rx="2" fill="var(--petrol)" />
    </svg>
  );
}

interface Props {
  snapshot: Snapshot;
  ci: CiChoice;
  onCi: (v: CiChoice) => void;
}

/** "Resultados": the 90/95 switch, the six indices as strips, and the empty state. */
export function IndexTable({ snapshot, ci, onCi }: Props) {
  const level = ci === 'Percentil90' ? '90' : '95';
  return (
    <>
      <h2 id="h-res">{ptNew['results.title']}</h2>
      <div className="seg" role="group" aria-label={pt['ConfidenceInterval']} data-testid="ci-select">
        {(['Percentil90', 'Percentil95'] as const).map((c) => {
          const l = c === 'Percentil90' ? '90' : '95';
          return (
            <button key={c} type="button" data-ci={l} aria-pressed={ci === c} onClick={() => onCi(c)}>
              {ptNew[`ci.${l}`]}
            </button>
          );
        })}
      </div>

      {!snapshot.indicesShown && <p className="empty-state" data-testid="results-empty">{ptNew['results.empty']}</p>}

      {/* The rows stay in the document (empty) while the empty state shows, so readers always find the cells. */}
      <div hidden={!snapshot.indicesShown}>
        {snapshot.indicesShown && (
          <div className="axis" aria-hidden="true">
            {TICKS.map((v) => <span key={v} style={{ left: `${((v - LO) / (HI - LO)) * 100}%` }}>{v}</span>)}
          </div>
        )}
        {INDEX_NAMES.map((name) => {
          const row = snapshot.indices[name];
          const entry = row?.entry;
          const ok = entry && entry !== 'unavailable' ? entry : null;
          const unavailable = entry === 'unavailable';
          const band = ok ? comparisonBand(ok.iq) : null;
          const ciValue = ok ? (ci === 'Percentil90' ? ok.ci90 : ok.ci95) : null;
          const titleProps = unavailable ? { title: UNAVAILABLE_TITLE } : {};
          return (
            <div key={name} className={name === 'completeScale' ? 'ix main' : 'ix'} data-testid={`index-row-${name}`}>
              <div className="ix-top">
                <b>{pt[`QI.${LABEL_KEY[name]}`]}</b>
                <span className="iq" data-testid={`index-iq-${name}`} {...titleProps}>{unavailable ? '—' : ok ? ok.iq : ''}</span>
              </div>
              {ok && <Strip iq={ok.iq} ci={ciValue} />}
              <div className="ix-meta">
                <span>
                  {ptNew['results.percentile']} <span data-testid={`index-pct-${name}`} {...titleProps}>{unavailable ? '—' : ok ? formatPercentile(ok.percentile) : ''}</span>
                </span>
                <span>
                  {fmt(ptNew['ci.range'], level)} <span data-testid={`index-ci-${name}`} {...titleProps}>{unavailable ? '—' : formatCi(ciValue)}</span>
                </span>
                <span>
                  {ptNew['results.sum']} <span data-testid={`index-sum-${name}`}>{row ? row.sum : ''}</span>
                </span>
                {band && <span data-testid={`index-class-${name}`}>{pt[`QI.AverageComparison.${band}`]}</span>}
              </div>
            </div>
          );
        })}
        <p className="scale-note">{ptNew['results.scaleNote']}</p>
      </div>
    </>
  );
}

/** The three headline indices for the compact strip shown below 1100 px. */
export function GlanceStrip({ snapshot }: { snapshot: Snapshot }) {
  if (!snapshot.indicesShown) return null;
  return (
    <>
      {(['verbal', 'realization', 'completeScale'] as const).map((name) => {
        const entry = snapshot.indices[name]?.entry;
        const iq = entry && entry !== 'unavailable' ? String(entry.iq) : '—';
        return (
          <div key={name} data-testid={`glance-${name}`}>
            <strong>{iq}</strong>
            <span>{pt[`QI.${LABEL_KEY[name]}`]}</span>
          </div>
        );
      })}
    </>
  );
}
