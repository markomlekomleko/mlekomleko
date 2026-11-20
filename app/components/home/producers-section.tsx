"use client";

/* eslint-disable @next/next/no-img-element -- Pre-optimised local photographs. */
import { useLocalize } from "@/app/lib/i18n/client";
import { producers } from "../../lib/producers";

/** "Ko proizvodi tvoje mleko?" (spec 19 Nov 2026, §6): real photos, farm name and place. */
export function ProducersSection() {
  const localize = useLocalize();
  return localize((
    <section className="producers" aria-labelledby="producers-title">
      <div className="page-shell">
        <div className="section-head producers-head">
          <h2 id="producers-title">Ko proizvodi tvoje mleko?</h2>
          <p className="lead">Naše proizvođače biramo pažljivo, vodeći računa o kvalitetu mleka, uslovima proizvodnje i pouzdanosti snabdevanja.</p>
        </div>
        <ul className="producers-grid">
          {producers.map((producer) => (
            <li key={producer.id}>
              <figure className="producer">
                <img src={producer.image} alt={producer.alt} width={producer.width} height={producer.height} style={{ objectPosition: producer.focus }} loading="lazy" />
                <figcaption>
                  <strong>{producer.name}</strong>
                  {producer.place ? <span>{producer.place}</span> : null}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
        <p className="producers-more"><a className="text-link" href="/o-nama#farmeri">Upoznaj naše farmere →</a></p>
      </div>
    </section>
  ));
}
