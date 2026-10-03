// The theme cookie is the app's only storage exception (REV-10): a presentation preference, never case data.
// The cookie property is touched here and in the boot script of index.html, nowhere else.
export type Theme = 'light' | 'dark';

export const THEME_COOKIE = 'wisc3-theme';
const MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

/** The stored theme, or null when the cookie is absent or holds anything but light|dark. */
export function readThemeCookie(): Theme | null {
  const m = new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]*)`).exec(document.cookie);
  return m && isTheme(m[1]) ? m[1] : null;
}

/** Writes the cookie (Path=/, SameSite=Lax, 180 days, Secure on https); invalid values are ignored. */
export function writeThemeCookie(theme: Theme): void {
  if (!isTheme(theme)) return;
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

/** The theme in effect: the explicit choice, otherwise the system preference. */
export function effectiveTheme(): Theme {
  const set = document.documentElement.dataset.theme;
  if (isTheme(set)) return set;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  if (isTheme(theme)) document.documentElement.dataset.theme = theme;
}
