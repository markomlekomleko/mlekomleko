"use client";

/* eslint-disable @next/next/no-img-element -- Pre-optimised local illustrations. */
import { useLocalize } from "@/app/lib/i18n/client";
import { homeCopy } from "../../lib/content";

const copy = homeCopy.steps;

// One illustration per step, in the order of the copy deck.
const art = [
  { src: "/images/ilustracije/pasnjak.webp", alt: "Domaćica na pašnjaku sa kozom i kravom" },
  { src: "/images/ilustracije/mlekadzija.webp", alt: "Mlekadžija utovara kante mleka u kombi" },
  { src: "/images/ilustracije/povratne-flase.webp", alt: "Prazne flaše se vraćaju dostavljaču" },
];

/**
 * The three steps on the goat-and-cow pattern, the same ground as the closing card
 * (meeting 17 Nov 2026: first section after the hero, in that style).
 */
export function StepsSection() {
  const localize = useLocalize();
  return localize((
    <section className="steps pattern-ground" aria-labelledby="steps-title">
      <div className="page-shell">
        <div className="steps-card">
          <div className="section-head">
            <p className="eyebrow">{copy.eyebrow}</p>
            <h2 id="steps-title">{copy.title}</h2>
          </div>
          {/* The <ol> already numbers the steps for assistive technology; the giant
              numerals are the visual echo of that order. */}
          <ol className="steps-grid">
            {copy.items.map((item, index) => (
              <li key={item.title}>
                <img className="steps-art" src={art[index]?.src} alt={art[index]?.alt ?? ""} width="1200" height="900" loading="lazy" />
                <span className="steps-number" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  ));
}
