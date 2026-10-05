import { pt } from '../i18n/pt';
import { ptNew } from '../i18n/pt-new';

interface Props {
  onShowTable: () => void;
  onPrint: () => void;
  onStartFresh: () => void;
}

export function SheetActions({ onShowTable, onPrint, onStartFresh }: Props) {
  return (
    <div className="actions">
      <button className="btn" type="button" data-testid="show-table" onClick={onShowTable}>{pt['Button.ShowLookupTable']}</button>
      <button className="btn" type="button" data-testid="print" onClick={onPrint}>{ptNew['print']}</button>
      <button className="btn primary" type="button" data-testid="start-fresh" onClick={onStartFresh}>{pt['Button.StartNew']}</button>
    </div>
  );
}
