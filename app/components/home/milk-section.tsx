"use client";

/* eslint-disable @next/next/no-img-element -- Local SVG icons. */
import { useLocalize } from "@/app/lib/i18n/client";
import { homeCopy } from "../../lib/content";

const copy = homeCopy.milk;

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
          </div>
          <ul className="milk-why-grid">
            {copy.items.map((item) => (
              <li key={item.title}>
                <img className="milk-why-icon" src={`/images/ikone/${item.icon}.svg`} alt="" width="72" height="72" loading="lazy" />
                <h3>{item.title}</h3>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  ));
}
