import type { BrowserContext } from '@playwright/test';

const AD_HOSTS = ['googlesyndication.com', 'doubleclick.net', 'googleadservices.com'];

export function isAdUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return AD_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export interface AdLog {
  /** ad requests aborted by the route */
  blocked: string[];
  /** ad URLs that got a response (must stay 0) */
  adResponses: string[];
}

/** Aborts the three ad domains on the context and logs attempts and any response that got through. */
export async function blockAds(context: BrowserContext): Promise<AdLog> {
  const log: AdLog = { blocked: [], adResponses: [] };
  await context.route(
    (url) => isAdUrl(url.toString()),
    (route) => {
      log.blocked.push(route.request().url());
      return route.abort('blockedbyclient');
    },
  );
  context.on('response', (resp) => {
    if (isAdUrl(resp.url())) log.adResponses.push(resp.url());
  });
  return log;
}
