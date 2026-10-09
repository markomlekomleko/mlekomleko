"use client";

import { useLocalize } from "@/app/lib/i18n/client";
import { homeCopy } from "../../lib/content";

export function RhythmSection() {
  const localize = useLocalize();
  const copy = homeCopy.rhythm;

  return localize((
    <section className="rhythm" aria-labelledby="rhythm-title">
      <div className="page-shell">
        <div className="section-head rhythm-head">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id="rhythm-title">{copy.title}</h2>
        </div>
        <div className="rhythm-grid">
          {copy.items.map((item) => (
            <article className="rhythm-card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
        <p className="rhythm-note">{copy.note}</p>
      </div>
    </section>
  ));
}
