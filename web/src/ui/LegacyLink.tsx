import { useEffect, useRef, useState } from 'react';
import { ptNew } from '../i18n/pt-new';

/** Accepts only an absolute http(s) URL; anything else counts as "no legacy URL". */
export function parseLegacyUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

// "Versão anterior" link (REV-10). The URL comes from /config.json, fetched once after the first render without
// blocking anything and without storing it in the page; nothing is rendered when it is unset or invalid.
export function LegacyLink() {
  const [url, setUrl] = useState<string | null>(null);
  const online = useOnline();
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    let alive = true;
    fetch('/config.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((c: { legacyUrl?: unknown } | null) => alive && setUrl(parseLegacyUrl(c?.legacyUrl)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!url) return null;
  if (online) {
    return (
      <a href={url} rel="noopener" data-testid="legacy-link">
        {ptNew['legacy']}
      </a>
    );
  }
  return (
    <>
      <button type="button" aria-disabled="true" aria-describedby="legacy-offline" data-testid="legacy-link">
        {ptNew['legacy']}
      </button>
      <span id="legacy-offline" data-testid="legacy-offline" className="legacy-note">
        {ptNew['legacy.offline']}
      </span>
    </>
  );
}
