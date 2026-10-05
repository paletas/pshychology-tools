import type { Age, Band } from '../engine/types';
import { ptNew } from '../i18n/pt-new';
import { pt } from '../i18n/pt';
import { guardText } from './guards/inputGuards';
import type { GuardMessage } from './guards/inputGuards';
import { fmtNodes } from './template';

interface Props {
  testDate: string;
  birthDate: string;
  age: Age | null;
  /** The norm band chosen for the age (null when the age is not supported). */
  band: Band | null;
  /** Guard messages (REV-12), shown next to the field they are about. */
  messages: GuardMessage[];
  /** `bad` is true when the browser holds text that is not a complete date (validity.badInput). */
  onTestDate: (v: string, bad: boolean) => void;
  onBirthDate: (v: string, bad: boolean) => void;
}

const AGE_TESTIDS = ['age-years', 'age-months', 'age-days'];

/** "Dados do teste": the two dates and the live age sentence (day-count age) with the norm-band line. */
export function DatesPanel({ testDate, birthDate, age, band, messages, onTestDate, onBirthDate }: Props) {
  const bandTemplate = band && band.from[1] >= 6 ? ptNew['age.bandHalf'] : ptNew['age.band'];
  const read = (fn: (v: string, bad: boolean) => void) => (e: { target: EventTarget }) => {
    const el = e.target as HTMLInputElement;
    fn(el.value, el.validity.badInput);
  };
  const describe = (field: 'birth' | 'test') => {
    const ids = messages.filter((m) => m.field === field || m.field === 'both').map((m) => `date-msg-${m.field}`);
    return ids.length ? ids.join(' ') : undefined;
  };
  const invalid = (field: 'birth' | 'test') => messages.some((m) => m.level === 'error' && (m.field === field || m.field === 'both')) || undefined;
  const dateProps = (field: 'birth' | 'test', fn: (v: string, bad: boolean) => void) => ({
    'aria-describedby': describe(field),
    'aria-invalid': invalid(field),
    onChange: read(fn),
    onInput: read(fn),
    onBlur: read(fn),
  });
  return (
    <div className="who">
      <label className="field" htmlFor="subjectBirthday">
        {pt['SubjectBirthday']}
        <input type="date" id="subjectBirthday" required value={birthDate} {...dateProps('birth', onBirthDate)} />
      </label>
      <label className="field" htmlFor="testDate">
        {pt['TestDate']}
        <input type="date" id="testDate" required value={testDate} {...dateProps('test', onTestDate)} />
      </label>
      {messages.map((m) => (
        <p key={m.key} className={`msg ${m.level}`} id={`date-msg-${m.field}`} data-testid={`date-msg-${m.field}`} data-key={m.key} data-level={m.level} role={m.level === 'error' ? 'alert' : 'status'}>
          {guardText(m.key, m.params)}
        </p>
      ))}
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
