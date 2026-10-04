import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { lookupGrid } from '../engine/bands';
import type { Band, RefData } from '../engine/types';
import { pt } from '../i18n/pt';
import { ptNew } from '../i18n/pt-new';
import { fmt } from './template';

const VERBAL = ['Information', 'Similarities', 'Arithmetic', 'Vocabulary', 'Comprehension', 'DigitMemory'];
const REALIZATION = ['ImageCompletion', 'Code', 'ImageDisposition', 'Cubes', 'ObjectComposition', 'SymbolSearch', 'Labyrinth'];
const DISPLAYED = [...VERBAL, ...REALIZATION];
const SCALED = Array.from({ length: 19 }, (_, i) => i + 1);
const isAverage = (s: number) => s >= 7 && s <= 13;

/** "a" for a single raw score, "a - b" for a range, '' when the scaled value does not occur. */
export function formatRange(range: [number, number] | null | undefined): string {
  if (!range) return '';
  return range[0] === range[1] ? `${range[0]}` : `${range[0]} - ${range[1]}`;
}

/** The scaled value whose raw range holds `raw`, or null. */
function hitOf(col: ([number, number] | null)[] | undefined, raw: number | null | undefined): number | null {
  if (!col || raw === null || raw === undefined) return null;
  for (const s of SCALED) {
    const r = col[s];
    if (r && raw >= r[0] && raw <= r[1]) return s;
  }
  return null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data: RefData;
  /** Norm band of the child (null when the age is not supported). */
  band: Band | null;
  /** REV-12: the table only shows when the date guard state is `ok`. */
  guardOk: boolean;
  /** Parsed raw scores entered so far (null when empty or invalid). */
  raw: Record<string, number | null>;
}

/** "Ver Tabela": the conversion table of the child's band as a modal dialog (wide table, chip list on narrow screens). */
export function LookupDialog({ open, onClose, data, band, guardOk, raw }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    } else if (!open && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [open]);

  useEffect(() => {
    const done = () => document.body.classList.remove('print-lookup');
    window.addEventListener('afterprint', done);
    return () => window.removeEventListener('afterprint', done);
  }, []);

  const grid = guardOk && band ? lookupGrid(data, band.id) : null;
  const label = band ? fmt(band.from[1] >= 6 ? '{0} anos e meio' : '{0} anos', band.from[0]) : '';
  const span = band ? `${band.from[0]} anos e ${band.from[1]} meses a ${band.to[0]} anos e ${band.to[1]} meses` : '';
  const current = DISPLAYED[idx];

  const print = () => {
    document.body.classList.add('print-lookup');
    window.print();
  };

  let body: ReactNode;
  if (!grid || !band) {
    body = (
      <p className="lk-hint" data-testid="lookup-empty">
        {pt['Table.NoTableDisplay']}
      </p>
    );
  } else {
    const hs = hitOf(grid[current], raw[current]);
    body = (
      <>
        <p className="lk-hint">
          <i className="lk-key" /> {ptNew['lookup.hint']}
        </p>
        <div className="lk-wide" tabIndex={0} aria-label={ptNew['lookup.scroll']}>
          <table className="lk" data-testid="lookup-table" data-band={band.id}>
            <caption className="sr-only">{fmt(ptNew['lookup.caption'], label)}</caption>
            <thead>
              <tr>
                <th className="corner" rowSpan={2} scope="col">{ptNew['lookup.corner']}</th>
                <th colSpan={VERBAL.length} className="grp v" scope="colgroup">{pt['TableHeader.VerbalTests']}</th>
                <th colSpan={REALIZATION.length} className="grp r" scope="colgroup">{pt['TableHeader.RealizationTests']}</th>
                <th className="corner" rowSpan={2} scope="col">{ptNew['lookup.corner']}</th>
              </tr>
              <tr>
                {DISPLAYED.map((id) => (
                  <th key={id} scope="col">{pt[`TableHeader.Test.${id}`]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SCALED.map((s) => (
                <tr key={s} className={isAverage(s) ? 'avg' : undefined}>
                  <th scope="row">{s}</th>
                  {DISPLAYED.map((id) => {
                    const hit = hitOf(grid[id], raw[id]) === s;
                    return (
                      <td key={id} className={hit ? 'hit' : undefined} data-testid={`lk-${id}-${s}`} data-hit={hit ? 'true' : 'false'}>
                        {formatRange(grid[id]?.[s])}
                      </td>
                    );
                  })}
                  <th scope="row">{s}</th>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="lk-narrow" data-testid="lookup-narrow">
          <div className="lk-chips" role="group" aria-label={ptNew['lookup.choose']}>
            {DISPLAYED.map((id, i) => (
              <button key={id} type="button" className="chip" data-testid={`lk-chip-${id}`} aria-pressed={i === idx} onClick={() => setIdx(i)}>
                {pt[`TableHeader.Test.${id}`]}
              </button>
            ))}
          </div>
          {raw[current] !== null && raw[current] !== undefined && (
            <p className="lk-given">
              {ptNew['lookup.given']} <b>{raw[current]}</b>
              {hs !== null && (
                <>
                  , {ptNew['lookup.givenScaled']} <b>{hs}</b>
                </>
              )}
            </p>
          )}
          <ul className="lk-list" aria-label={pt[`TableHeader.Test.${current}`]}>
            {SCALED.map((s) => (
              <li key={s} className={[isAverage(s) ? 'avg' : '', hs === s ? 'hit' : ''].filter(Boolean).join(' ') || undefined} data-testid={`lkn-${s}`} data-hit={hs === s ? 'true' : 'false'}>
                <b>{s}</b>
                <span>{formatRange(grid[current]?.[s]) || '—'}</span>
              </li>
            ))}
          </ul>
          <div className="lk-step">
            <button className="btn" type="button" data-testid="lk-prev" onClick={() => setIdx((idx + DISPLAYED.length - 1) % DISPLAYED.length)}>{ptNew['lookup.prev']}</button>
            <button className="btn" type="button" data-testid="lk-next" onClick={() => setIdx((idx + 1) % DISPLAYED.length)}>{ptNew['lookup.next']}</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <dialog
      id="lookup"
      ref={ref}
      data-testid="lookup-dialog"
      aria-labelledby="lk-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="lk-head">
        <div>
          <h2 id="lk-title">{ptNew['lookup.title']}</h2>
          {band && grid && <p className="lk-sub">{fmt(ptNew['lookup.sub'], `${label} (${span})`)}</p>}
        </div>
        <div className="lk-actions">
          {grid && <button className="btn" type="button" id="lk-print" data-testid="lookup-print" onClick={print}>{ptNew['print']}</button>}
          <button className="btn primary" type="button" id="lk-close" data-testid="lookup-close" onClick={onClose}>{ptNew['lookup.close']}</button>
        </div>
      </div>
      {body}
    </dialog>
  );
}
