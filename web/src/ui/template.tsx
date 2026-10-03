import { Fragment } from 'react';
import type { ReactNode } from 'react';

/** Replaces {0}, {1}... in a string template with text. */
export function fmt(template: string, ...values: (string | number)[]): string {
  return template.replace(/\{(\d+)\}/g, (_, i) => String(values[Number(i)] ?? ''));
}

/** Like fmt, but each {n} becomes the node produced by render(n), so a value can carry its own element. */
export function fmtNodes(template: string, render: (index: number) => ReactNode): ReactNode[] {
  return template.split(/(\{\d+\})/).map((part, i) => {
    const m = /^\{(\d+)\}$/.exec(part);
    return <Fragment key={i}>{m ? render(Number(m[1])) : part}</Fragment>;
  });
}
