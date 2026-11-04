import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/analytics/client', () => ({ track: vi.fn() }));

import { track } from '../../src/analytics/client';
import { __resetErrorsForTests, installErrorHandlers, reportError, whereFromStack } from '../../src/analytics/errors';

const trackMock = vi.mocked(track);

beforeEach(() => {
  __resetErrorsForTests();
  vi.clearAllMocks();
  trackMock.mockReset();
});

describe('analytics errors', () => {
  it('whereFromStack picks the first same-origin assets frame', () => {
    const stack = [
      'Error: x',
      '    at f (chrome-extension://abcdef/content.js:3:4)',
      '    at g (https://x.test/assets/index-ab12.js:10:5)',
      '    at h (https://x.test/assets/other-1.js:99:1)',
    ].join('\n');
    expect(whereFromStack(stack, 'https://x.test')).toBe('index-ab12.js:10');
  });

  it('whereFromStack is external for foreign or missing stacks', () => {
    expect(whereFromStack(undefined, 'https://x.test')).toBe('external');
    expect(whereFromStack('Error\n    at a (https://evil.example/assets/a.js:1:1)', 'https://x.test')).toBe('external');
  });

  it('reportError sends name from allow-list only', () => {
    reportError('error', new TypeError('t'), 'a.js:1');
    class Custom extends Error {
      constructor() {
        super('c');
        this.name = 'Custom';
      }
    }
    reportError('error', new Custom(), 'a.js:1');
    expect(trackMock.mock.calls[0][0].data.name).toBe('TypeError');
    expect(trackMock.mock.calls[1][0].data.name).toBe('other');
  });

  it('reportError never includes the message', () => {
    reportError('error', new Error('secret failure 12345'), 'a.js:1');
    const out = JSON.stringify(trackMock.mock.calls);
    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(out).not.toContain('secret');
    expect(out).not.toContain('12345');
  });

  it('capped at 5 per session', () => {
    for (let i = 0; i < 8; i++) reportError('error', new Error('e'), 'a.js:1');
    expect(trackMock).toHaveBeenCalledTimes(5);
  });

  it('re-entrancy guard', () => {
    let again = true;
    trackMock.mockImplementation(() => {
      if (again) {
        again = false;
        reportError('error', new Error('inner'), 'a.js:2');
      }
    });
    expect(() => reportError('error', new Error('outer'), 'a.js:1')).not.toThrow();
    expect(trackMock).toHaveBeenCalledTimes(1);
  });

  it('installErrorHandlers reports window error and unhandledrejection', () => {
    installErrorHandlers();
    window.dispatchEvent(new ErrorEvent('error', { error: new RangeError('x'), filename: location.origin + '/assets/app-1.js', lineno: 7 }));
    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock.mock.calls[0][0].data).toEqual({ kind: 'error', name: 'RangeError', where: 'app-1.js:7' });

    window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: new TypeError('nope') }));
    expect(trackMock).toHaveBeenCalledTimes(2);
    expect(trackMock.mock.calls[1][0].data.kind).toBe('unhandledrejection');
    expect(trackMock.mock.calls[1][0].data.name).toBe('TypeError');
  });
});
