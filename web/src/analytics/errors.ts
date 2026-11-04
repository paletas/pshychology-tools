import { track } from './client';
import { buildClientError } from './events';
import type { ErrorKind } from './events';

const MAX_PER_PAGE = 5;
let count = 0;
let busy = false;
let installed = false;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `file.js:line` of the first same-origin /assets/ frame in a stack, else `external`. */
export function whereFromStack(stack: unknown, origin: string): string {
  const re = new RegExp(`${escapeRe(origin)}/assets/([^/\\s:?)]+?)(?:\\?[^:\\s)]*)?:(\\d+):\\d+`);
  for (const line of String(stack).split('\n')) {
    const m = re.exec(line);
    if (m) return `${m[1]}:${m[2]}`;
  }
  return 'external';
}

/** Sends at most 5 error events per page load; only the error class name from an allow-list. */
export function reportError(kind: ErrorKind, err: unknown, where: string): void {
  if (count >= MAX_PER_PAGE || busy) return;
  busy = true;
  try {
    const name = err instanceof Error || err instanceof DOMException ? err.name : undefined;
    track(buildClientError(kind, name, where));
    count++;
  } catch {
    // reporting must never throw
  } finally {
    busy = false;
  }
}

export function installErrorHandlers(): void {
  if (installed) return;
  installed = true;
  window.addEventListener('error', (e) => {
    const prefix = location.origin + '/assets/';
    const where =
      e.filename && e.filename.startsWith(prefix)
        ? `${e.filename.slice(prefix.length).replace(/[?#].*$/, '')}:${e.lineno}`
        : whereFromStack(e.error?.stack, location.origin);
    reportError('error', e.error, where);
  });
  window.addEventListener('unhandledrejection', (e) => {
    reportError('unhandledrejection', e.reason, whereFromStack(e.reason?.stack, location.origin));
  });
}

export function __resetErrorsForTests(): void {
  count = 0;
  busy = false;
  installed = false;
}
