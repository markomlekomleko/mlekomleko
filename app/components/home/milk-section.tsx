"use client";

/* eslint-disable @next/next/no-img-element -- Pre-optimised local illustration and SVG icons. */
import { useLocalize } from "@/app/lib/i18n/client";
import { homeCopy } from "../../lib/content";

const copy = homeCopy.milk;

/**
 * Why this milk, straight under the hero, on the goat-and-cow ground: one promise in
 * the heading beside the pasture illustration, one line under it, and four short facts
 * with an icon each. The icons only echo the titles, so they are decorative.
 */
export function MilkSection() {
  const localize = useLocalize();
  return localize((
    <section className="milk-why pattern-ground" aria-labelledby="milk-why-title">
      <div className="page-shell">
        <div className="milk-card">
          <div className="milk-why-top">
            <div className="section-head">
              <h2 id="milk-why-title" aria-label={copy.title}>
                <span className="milk-why-line">{copy.titleLines[0]}</span>{" "}
                <span className="milk-why-line">{copy.titleLines[1]}</span>
              </h2>
              <p className="lead">{copy.lead}</p>
            </div>
            <img className="milk-why-art" src="/images/ilustracije/pasnjak.webp" alt="Krava i koza zajedno na pašnjaku" width="1200" height="900" loading="lazy" />
          </div>
          <ul className="milk-why-grid">
            {copy.items.map((item) => (
              <li key={item.title}>
                <img className="milk-why-icon" src={`/images/ikone/${item.icon}.svg`} alt="" width="72" height="72" loading="lazy" />
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  ));
}
