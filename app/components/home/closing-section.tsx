import type { StorefrontSettings } from "../../lib/frontend";

export function ClosingSection({ settings }: { settings: Pick<StorefrontSettings, "guaranteeText"> }) {
  return (
    <section className="closing" aria-labelledby="closing-title">
      <div className="page-shell">
        <p className="eyebrow">Mleko i Mleko</p>
        <h2 id="closing-title">Spremno za tvoje sledeće jutro?</h2>
        <p>{settings.guaranteeText}</p>
        <a className="button" href="#izaberite-mleko">
          Izaberi svoje mleko
        </a>
      </div>
    </section>
  );
}
