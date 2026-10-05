import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Layout } from '../../src/ui/Layout';
import { LegacyLink, parseLegacyUrl } from '../../src/ui/LegacyLink';
import { ThemeToggle } from '../../src/ui/ThemeToggle';
import { effectiveTheme, readThemeCookie, writeThemeCookie } from '../../src/theme/themeCookie';
import { pt } from '../../src/i18n/pt';
import { ptNew } from '../../src/i18n/pt-new';

const setOnline = (v: boolean) => {
  Object.defineProperty(navigator, 'onLine', { value: v, configurable: true });
  act(() => {
    window.dispatchEvent(new Event(v ? 'online' : 'offline'));
  });
};

function clearThemeCookie() {
  document.cookie = 'wisc3-theme=; Path=/; Max-Age=0';
  delete document.documentElement.dataset.theme;
}

beforeEach(clearThemeCookie);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setOnline(true);
  clearThemeCookie();
});

describe('theme cookie', () => {
  function spyCookieWrites() {
    const writes: string[] = [];
    const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!;
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => desc.get!.call(document),
      set: (v: string) => {
        writes.push(v);
        desc.set!.call(document, v);
      },
    });
    return writes;
  }
  afterEach(() => {
    delete (document as { cookie?: string }).cookie;
  });

  it('the toggle writes wisc3-theme with Path, Max-Age (180 days), SameSite=Lax and applies the theme', () => {
    const writes = spyCookieWrites();
    render(<ThemeToggle />);
    const btn = screen.getByTestId('theme-toggle');
    expect(btn.getAttribute('aria-label')).toBe(ptNew['theme.aria']);
    fireEvent.click(btn);
    expect(writes).toEqual(['wisc3-theme=dark; Path=/; Max-Age=15552000; SameSite=Lax']);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(readThemeCookie()).toBe('dark');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn);
    expect(writes[1]).toBe('wisc3-theme=light; Path=/; Max-Age=15552000; SameSite=Lax');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('adds Secure on https only', () => {
    const writes = spyCookieWrites();
    vi.stubGlobal('location', { protocol: 'https:' });
    writeThemeCookie('dark');
    expect(writes[0]).toBe('wisc3-theme=dark; Path=/; Max-Age=15552000; SameSite=Lax; Secure');
    vi.stubGlobal('location', { protocol: 'http:' });
    writeThemeCookie('light');
    expect(writes[1]).not.toMatch(/Secure/);
  });

  it('ignores invalid values when reading and writing', () => {
    const writes = spyCookieWrites();
    document.cookie = 'wisc3-theme=purple; Path=/';
    expect(readThemeCookie()).toBeNull();
    const before = writes.length;
    writeThemeCookie('purple' as never);
    expect(writes.length).toBe(before);
    document.cookie = 'wisc3-theme=dark; Path=/';
    expect(readThemeCookie()).toBe('dark');
  });

  it('starts from the explicit theme, else the system preference', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(effectiveTheme()).toBe('dark');
    document.documentElement.dataset.theme = 'light';
    expect(effectiveTheme()).toBe('light');
  });

  it('no case value ends up in a cookie', () => {
    const writes = spyCookieWrites();
    render(
      <Layout themeSlot={<ThemeToggle />}>
        <input data-testid="case" />
      </Layout>,
    );
    fireEvent.change(screen.getByTestId('case'), { target: { value: '2015-03-09' } });
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(writes.join('\n')).not.toMatch(/2015|case|birth|raw/i);
    expect(document.cookie).toBe('wisc3-theme=dark');
  });
});

describe('LegacyLink', () => {
  function stubConfig(body: unknown, ok = true) {
    const f = vi.fn(async () => ({ ok, json: async () => body }) as Response);
    vi.stubGlobal('fetch', f);
    return f;
  }

  it('parseLegacyUrl accepts only absolute http(s) URLs', () => {
    expect(parseLegacyUrl('https://old.example.org/x')).toBe('https://old.example.org/x');
    for (const bad of [null, undefined, '', '/x', 'javascript:alert(1)', 'ftp://a.b', 7]) expect(parseLegacyUrl(bad)).toBeNull();
  });

  it('null config renders nothing', async () => {
    const f = stubConfig({ legacyUrl: null });
    render(<LegacyLink />);
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(screen.queryByTestId('legacy-link')).toBeNull();
  });

  it('a valid URL renders an anchor with that href, rel noopener and the string', async () => {
    stubConfig({ legacyUrl: 'https://old.example.org/wisc3' });
    render(<LegacyLink />);
    const a = (await screen.findByTestId('legacy-link')) as HTMLAnchorElement;
    expect(a.tagName).toBe('A');
    expect(a.getAttribute('href')).toBe('https://old.example.org/wisc3');
    expect(a.getAttribute('rel')).toBe('noopener');
    expect(a.textContent).toBe(ptNew['legacy']);
  });

  it('an invalid URL renders nothing', async () => {
    const f = stubConfig({ legacyUrl: 'javascript:alert(1)' });
    render(<LegacyLink />);
    await waitFor(() => expect(f).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByTestId('legacy-link')).toBeNull();
  });

  it('a failing fetch renders nothing and raises no error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    const err = vi.spyOn(console, 'error');
    render(<LegacyLink />);
    await act(async () => {});
    expect(screen.queryByTestId('legacy-link')).toBeNull();
    expect(err).not.toHaveBeenCalled();
  });

  it('offline: a disabled button with the note; online again restores the link; one fetch only', async () => {
    const f = stubConfig({ legacyUrl: 'https://old.example.org/wisc3' });
    render(<LegacyLink />);
    await screen.findByTestId('legacy-link');
    setOnline(false);
    const b = screen.getByTestId('legacy-link');
    expect(b.tagName).toBe('BUTTON');
    expect(b.getAttribute('aria-disabled')).toBe('true');
    expect(b.hasAttribute('href')).toBe(false);
    expect(screen.getByTestId('legacy-offline').textContent).toBe(ptNew['legacy.offline']);
    setOnline(true);
    expect(screen.getByTestId('legacy-link').tagName).toBe('A');
    expect(screen.queryByTestId('legacy-offline')).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledWith('config.json');
  });

  it('does not block the page: children render while the fetch is pending', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(
      <Layout legacySlot={<LegacyLink />}>
        <p data-testid="child">x</p>
      </Layout>,
    );
    expect(screen.getByTestId('child')).toBeTruthy();
    expect(pt['Language']).toBeTruthy();
  });
});
