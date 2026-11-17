"use client";

import { useLocalize } from "@/app/lib/i18n/client";
import { homeCopy } from "../../lib/content";

const copy = homeCopy.milk;

/**
 * Why this milk, straight under the hero: one promise in the heading, one line under
 * it, four short facts. Kept deliberately sparse so it reads in a glance.
 */
export function MilkSection() {
  const localize = useLocalize();
  return localize((
    <section className="milk-why" aria-labelledby="milk-why-title">
      <div className="page-shell">
        <div className="section-head">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id="milk-why-title" aria-label={copy.title}>
            <span className="milk-why-line">{copy.titleLines[0]}</span>{" "}
            <span className="milk-why-line">{copy.titleLines[1]}</span>
          </h2>
          <p className="lead">{copy.lead}</p>
        </div>
        <ul className="milk-why-grid">
          {copy.items.map((item) => (
            <li key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  ));
}
