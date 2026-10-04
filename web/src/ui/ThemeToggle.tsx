import { useState } from 'react';
import { ptNew } from '../i18n/pt-new';
import { applyTheme, effectiveTheme, writeThemeCookie } from '../theme/themeCookie';
import type { Theme } from '../theme/themeCookie';

// Switches light/dark; the choice is applied at once and remembered only in the theme cookie.
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => effectiveTheme());
  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    writeThemeCookie(next);
    setTheme(next);
  };
  return (
    <button type="button" className="theme-toggle" data-testid="theme-toggle" aria-pressed={theme === 'dark'} aria-label={ptNew['theme.aria']} onClick={toggle}>
      {ptNew['theme']}
    </button>
  );
}
