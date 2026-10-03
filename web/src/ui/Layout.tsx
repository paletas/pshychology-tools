import { useState } from 'react';
import type { ReactNode } from 'react';
import { pt } from '../i18n/pt';

// Page shell, same structure and Tailwind classes as MainLayout.razor (nav, header, main, footer).
// Differences (reported in the parity report): the logo is drawn inline instead of loaded from tailwindui.com,
// the burger works (the old one is inert) and the culture selector is a static copy (pt-PT is the only culture).
export function Layout({ children, dataVersion }: { children: ReactNode; dataVersion?: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="relative min-h-screen">
      <nav className="bg-gray-800">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-8 w-8" viewBox="0 0 32 32" role="img" aria-label="Workflow">
                  <title>Workflow</title>
                  <path d="M16 3 29 10.5v11L16 29 3 21.5v-11z" fill="#6366f1" />
                  <path d="M16 11 22.5 14.75v7.5L16 26 9.5 22.25v-7.5z" fill="#ffffff" fillOpacity="0.35" />
                </svg>
              </div>
              <div className="hidden md:block">
                <div className="ml-10 flex items-baseline space-x-4">
                  <a href="/wisc3" className="text-gray-300 hover:bg-gray-700 hover:text-white px-3 py-2 rounded-md text-sm font-medium">WISC-III</a>
                </div>
              </div>
            </div>
            <div className="-mr-2 flex md:hidden">
              <button
                type="button"
                className="navbar-burger bg-gray-800 inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-white"
                aria-label="Open main menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
              >
                <span className="sr-only">Open main menu</span>
                <svg id="main-nav-button-closed" className={`${menuOpen ? 'hidden' : 'block'} h-6 w-6`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                <svg id="main-nav-button-open" className={`${menuOpen ? 'block' : 'hidden'} h-6 w-6`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div id="main-nav" className={menuOpen ? 'block md:hidden' : 'hidden md:hidden'}>
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            <a href="/wisc3" className="bg-gray-900 text-white block px-3 py-2 rounded-md text-base font-medium">WISC-III</a>
          </div>
        </div>
      </nav>

      <header className="bg-white shadow">
        <div className="max-w-screen-2xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold leading-tight text-gray-900">WISC-III</h1>
        </div>
      </header>
      <main className="pb-10">
        <div className="max-w-screen-2xl mx-auto py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
      <footer className="bg-white border-0 border-top-2 absolute bottom-0 w-full min-h-9">
        <div className="font-bold inline">{pt['Language']}:</div>
        <select className="border-0 border-b-2" defaultValue="pt-PT">
          <option value="pt-PT">{pt['Language.pt-PT']}</option>
        </select>
        {dataVersion !== undefined && (
          <span className="ml-4 text-xs text-gray-600 print:hidden" data-testid="data-version">Dados: {dataVersion}</span>
        )}
      </footer>
    </div>
  );
}
