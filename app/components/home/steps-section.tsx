"use client";

import { useLocalize } from "@/app/lib/i18n/client";
import { homeCopy } from "../../lib/content";

const copy = homeCopy.steps;

export function StepsSection() {
  const localize = useLocalize();
  return localize((
    <section className="steps" aria-labelledby="steps-title">
      <div className="page-shell">
        <div className="section-head">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id="steps-title">{copy.title}</h2>
        </div>
        {/* The <ol> already numbers the steps for assistive technology; the giant
            numerals are the visual echo of that order. */}
        <ol className="steps-grid">
          {copy.items.map((item, index) => (
            <li key={item.title}>
              <span className="steps-number" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  ));
}
