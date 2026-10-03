import type { Age, Band } from '../engine/types';
import { ptNew } from '../i18n/pt-new';
import { pt } from '../i18n/pt';
import { fmtNodes } from './template';

interface Props {
  testDate: string;
  birthDate: string;
  age: Age | null;
  /** The norm band chosen for the age (null when the age is not supported). */
  band: Band | null;
  onTestDate: (v: string) => void;
  onBirthDate: (v: string) => void;
}

const AGE_TESTIDS = ['age-years', 'age-months', 'age-days'];

/** "Dados do teste": the two dates and the live age sentence (day-count age) with the norm-band line. */
export function DatesPanel({ testDate, birthDate, age, band, onTestDate, onBirthDate }: Props) {
  const bandTemplate = band && band.from[1] >= 6 ? ptNew['age.bandHalf'] : ptNew['age.band'];
  return (
    <div className="who">
      <label className="field" htmlFor="subjectBirthday">
        {pt['SubjectBirthday']}
        <input type="date" id="subjectBirthday" required value={birthDate} onChange={(e) => onBirthDate(e.target.value)} onInput={(e) => onBirthDate((e.target as HTMLInputElement).value)} />
      </label>
      <label className="field" htmlFor="testDate">
        {pt['TestDate']}
        <input type="date" id="testDate" required value={testDate} onChange={(e) => onTestDate(e.target.value)} onInput={(e) => onTestDate((e.target as HTMLInputElement).value)} />
      </label>
      <p className="age" data-testid="age" aria-live="polite">
        {age ? (
          <>
            <strong>{fmtNodes(ptNew['age.sentence'], (i) => <span data-testid={AGE_TESTIDS[i]}>{age[i]}</span>)}</strong>
            {band && <span data-testid="norm-band">{fmtNodes(bandTemplate, () => band.from[0])}</span>}
          </>
        ) : (
          <span data-testid="age-empty">{ptNew['age.empty']}</span>
        )}
      </p>
    </div>
  );
}
