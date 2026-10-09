"use client";

import { useSyncExternalStore } from "react";
import { localizeTree } from "./lib/i18n/render";
import { defaultLocale, languageTags, splitLocale } from "./lib/i18n/routing";
// global-error replaces the root layout, so neither base.css nor the next/font
// variables reach it. tokens.css is safe to import twice (it only declares :root
// properties); the rest is a self-contained block, kept inline rather than in a shared
// stylesheet so a second copy of that sheet can never be ordered ahead of base.css.
import "./styles/tokens.css";

const styles = `
.global-error { margin: 0; background: var(--bg); color: var(--ink); font-family: Arial, sans-serif; line-height: 1.5; }
.global-error-main { max-width: 720px; margin: 0 auto; padding: 12vh 20px; }
.global-error-eyebrow { margin: 0 0 12px; font-size: .75rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
.global-error h1 { margin: 0 0 16px; font-family: "Arial Black", Arial, sans-serif; font-size: clamp(2.25rem, 8vw, 4.5rem); font-weight: 900; letter-spacing: -.035em; line-height: .92; overflow-wrap: break-word; text-transform: uppercase; }
.global-error p { margin: 0 0 8px; }
.global-error-button { min-height: 52px; margin-top: 16px; padding: 0 28px; border: 1px solid var(--ink); border-radius: 0; background: var(--ink); color: var(--surface); cursor: pointer; font: inherit; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; }
.global-error-button:hover { border-color: var(--brand); background: var(--brand); color: #fff; }
.global-error-button:focus-visible { outline: 3px solid var(--ink); outline-offset: 3px; }
`;

const subscribe = () => () => {};
const errorLocale = () => splitLocale(window.location.pathname).locale;

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  // This boundary replaces the layout, so its locale provider is unavailable.
  const locale = useSyncExternalStore(subscribe, errorLocale, () => defaultLocale);
  const localize = (node: React.ReactNode) => localizeTree(node, locale);
  return localize((
    <html lang={languageTags[locale]}>
      <body className="global-error">
        <style>{styles}</style>
        <main className="global-error-main">
          <p className="global-error-eyebrow">Mleko i Mleko</p>
          <h1>Došlo je do privremenog problema.</h1>
          <p>Pokušaj ponovo. Tvoji podaci nisu prikazani na ovoj stranici.</p>
          {error.digest && <p>Šifra greške: {error.digest}</p>}
          <button className="global-error-button" type="button" onClick={retry}>Pokušaj ponovo</button>
        </main>
      </body>
    </html>
  ));
}
