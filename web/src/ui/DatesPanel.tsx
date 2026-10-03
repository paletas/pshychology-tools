import type { Age } from '../engine/types';
import { pt } from '../i18n/pt';

const INPUT = 'mt-0 block w-full px-0.5 border-0 border-b-2 border-gray-200 focus:ring-0 focus:border-black';

interface Props {
  testDate: string;
  birthDate: string;
  age: Age | null;
  onTestDate: (v: string) => void;
  onBirthDate: (v: string) => void;
  onShowTable: () => void;
  onStartFresh: () => void;
}

export function DatesPanel({ testDate, birthDate, age, onTestDate, onBirthDate, onShowTable, onStartFresh }: Props) {
  return (
    <div className="flex-auto flex flex-row divide-x divide-black space-x-4">
      <div className="flex-auto space-y-2">
        <label className="font-extrabold block uppercase">{pt['Input']}</label>

        <div>
          <label htmlFor="testDate" className="font-bold">{pt['TestDate']}</label>
          <input type="date" className={INPUT} id="testDate" required value={testDate} onChange={(e) => onTestDate(e.target.value)} onInput={(e) => onTestDate((e.target as HTMLInputElement).value)} />
        </div>
        <div>
          <label htmlFor="subjectBirthday" className="font-bold">{pt['SubjectBirthday']}</label>
          <input type="date" className={INPUT} id="subjectBirthday" required value={birthDate} onChange={(e) => onBirthDate(e.target.value)} onInput={(e) => onBirthDate((e.target as HTMLInputElement).value)} />
        </div>

        <div className="flex flex-row space-x-4 mx-auto justify-end">
          <button className="bg-gray-300 rounded-xl p-2 disabled:opacity-50" onClick={onShowTable} data-testid="show-table">
            <svg className="block stroke-current stroke-2 w-6 h-6 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            {pt['Button.ShowLookupTable']}
          </button>
          <button className="bg-gray-300 rounded-xl p-2 disabled:opacity-50" onClick={onStartFresh} data-testid="start-fresh">
            <svg className="block stroke-current stroke-2 w-6 h-6 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {pt['Button.StartNew']}
          </button>
        </div>
      </div>

      <div className="flex-auto pl-4">
        <div>
          <label className="font-extrabold block uppercase">{pt['SubjectAge']}</label>

          <label htmlFor="subjectAgeYear" className="font-bold">{pt['SubjectAge.Display.Year']}</label>
          <input type="number" className={INPUT} id="subjectAgeYear" disabled value={age ? age[0] : ''} readOnly />
          <label htmlFor="subjectAgeMonth" className="font-bold">{pt['SubjectAge.Display.Month']}</label>
          <input type="number" className={INPUT} id="subjectAgeMonth" disabled value={age ? age[1] : ''} readOnly />
          <label htmlFor="subjectAgeDay" className="font-bold">{pt['SubjectAge.Display.Day']}</label>
          <input type="number" className={INPUT} id="subjectAgeDay" disabled value={age ? age[2] : ''} readOnly />
        </div>
      </div>
    </div>
  );
}
