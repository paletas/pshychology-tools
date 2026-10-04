import { test, expect } from '@playwright/test';
import { diffCells } from '../helpers/app';

test.describe('[REV-13] diffCells absent-index rule', () => {
  test('absent index fields equal exact blanks under results-empty', () => {
    expect(diffCells({ 'results-empty': 'x' }, { 'index-sum-full': '', 'index-ci-full': ' - ' })).toEqual([]);
  });

  test('absent blank CI is a mismatch without results-empty', () => {
    expect(diffCells({}, { 'index-ci-full': ' - ' })).toEqual(['index-ci-full: expected " - ", got missing']);
  });

  test('absent index is a mismatch when the expected text is the unavailable marker', () => {
    expect(diffCells({ 'results-empty': 'x' }, { 'index-iq-full': '—' })).toEqual(['index-iq-full: expected "—", got missing']);
  });

  test('absent index is a mismatch when a value is expected', () => {
    expect(diffCells({ 'results-empty': 'x' }, { 'index-iq-full': '100' })).toEqual(['index-iq-full: expected "100", got missing']);
  });

  test('absent non-index field is a mismatch even when blank is expected', () => {
    expect(diffCells({ 'results-empty': 'x' }, { 'sum-complete': '' })).toEqual(['sum-complete: expected "", got missing']);
  });

  test('absent index is a mismatch when the expected blank is not the exact placeholder', () => {
    expect(diffCells({ 'results-empty': 'x' }, { 'index-ci-full': '-' })).toEqual(['index-ci-full: expected "-", got missing']);
  });

  test('present blank CI does not match a real interval', () => {
    expect(diffCells({ 'index-ci-full': ' - ' }, { 'index-ci-full': '80 - 90' })).toEqual(['index-ci-full: expected "80 - 90", got " - "']);
  });
});
