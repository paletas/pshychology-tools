import { useState } from 'react';
import type { ReactNode } from 'react';
import { pt } from '../i18n/pt';
import { ptNew } from '../i18n/pt-new';

interface LayoutProps {
  children: ReactNode;
  dataVersion?: string;
  /** Compact results strip shown below 1100 px (filled by the results batch). */
  glance?: ReactNode;
  /** Slot for the "Versão anterior" link (REV-10), rendered inside the navigation. */
  legacySlot?: ReactNode;
  /** Slot for the theme toggle (REV-10), last item of the top bar. */
  themeSlot?: ReactNode;
}

// Page shell of the redesign: top bar (brand, navigation, menu button, slots), glance strip, main, footer.
export function Layout({ children, dataVersion, glance, legacySlot, themeSlot }: LayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <div className="brand">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <rect x="2" y="2" width="28" height="28" rx="7" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M7 21 L12 12 L17 18 L25 8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {ptNew['brand']}
          </div>
          <nav id="main-nav" className={menuOpen ? 'open' : undefined} aria-label={ptNew['nav.aria']}>
            <a href="wisc3" aria-current="page">WISC-III</a>
            {legacySlot}
          </nav>
          <button type="button" className="menu" aria-controls="main-nav" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
            {ptNew['menu']}
          </button>
          {themeSlot}
        </div>
      </header>

      <div className="glance" id="glance" aria-live="polite">{glance}</div>

      <main className="wrap">
        <h1>WISC-III</h1>
        {children}
      </main>

      <footer className="foot">
        <span>{pt['Language']}: {pt['Language.pt-PT']}</span>
        {dataVersion !== undefined && <span data-testid="data-version">Dados: {dataVersion}</span>}
        <span>{ptNew['footer.offline']}</span>
      </footer>
    </>
  );
}
