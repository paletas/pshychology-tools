import { lookupGrid } from '../engine/bands';
import type { RefData } from '../engine/types';
import { pt } from '../i18n/pt';

const VERBAL = ['Information', 'Similarities', 'Arithmetic', 'Vocabulary', 'Comprehension', 'DigitMemory'];
const REALIZATION = ['ImageCompletion', 'Code', 'ImageDisposition', 'Cubes', 'ObjectComposition', 'SymbolSearch', 'Labyrinth'];
const DISPLAYED = [...VERBAL, ...REALIZATION];

function display(range: [number, number] | null | undefined): string {
  if (!range) return '';
  return range[0] === range[1] ? `${range[0]}` : `${range[0]} - ${range[1]}`;
}

export function LookupTableVisualizer({ data, bandId }: { data: RefData; bandId: string | null }) {
  const grid = bandId ? lookupGrid(data, bandId) : null;
  return (
    <table className="table-auto">
      <thead>
        <tr>
          <td className="invisible"></td>
          <td className="capitalize font-extrabold" colSpan={6}>{pt['TableHeader.VerbalTests']}</td>
          <td className="capitalize font-extrabold" colSpan={7}>{pt['TableHeader.RealizationTests']}</td>
        </tr>
        <tr>
          <td className="font-bold">{pt['TableHeader.StandardizedResults']}</td>
          {DISPLAYED.map((id) => (
            <td key={id} className="font-bold">{pt[`TableHeader.Test.${id}`]}</td>
          ))}
          <td className="font-bold">{pt['TableHeader.StandardizedResults']}</td>
        </tr>
      </thead>
      <tbody>
        {!grid ? (
          <tr className="font-bold">
            <td>{pt['Table.NoTableDisplay']}</td>
          </tr>
        ) : (
          Array.from({ length: 19 }, (_, i) => i + 1).map((s) => (
            <tr key={s}>
              <td className="font-bold">{s}</td>
              {DISPLAYED.map((id) => (
                <td key={id}>{display(grid[id]?.[s])}</td>
              ))}
              <td className="font-bold">{s}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
