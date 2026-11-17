"use client";

import { useLocalize } from "@/app/lib/i18n/client";
import { useState } from "react";

export type Mlekomat = {
  name: string;
  /** What Google Maps searches for; the place's name plus city finds the listing. */
  query: string;
  milk: string;
};

const directions = (query: string) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;

/**
 * Locations beside one Google map. Picking a location moves the map; "Put do mene" opens
 * Google Maps directions from the visitor's own position, which is how they find the
 * nearest one without the site ever asking for their location.
 */
export function MlekomatMap({ locations }: { locations: readonly Mlekomat[] }) {
  const localize = useLocalize();
  const [active, setActive] = useState(0);
  const current = locations[active];
  return localize((
    <div className="mlekomat-map">
      <ul className="mlekomat-list">
        {locations.map((place, index) => (
          <li key={place.name} data-active={index === active}>
            <button type="button" aria-pressed={index === active} onClick={() => setActive(index)}>
              <strong>{place.name}</strong>
              <span>{place.milk}</span>
            </button>
            <a className="text-link" href={directions(place.query)} target="_blank" rel="noreferrer">Put do mene ↗</a>
          </li>
        ))}
      </ul>
      <div className="mlekomat-frame">
        <iframe
          key={current.query}
          title={`Mapa: ${current.name}`}
          src={`https://www.google.com/maps?q=${encodeURIComponent(current.query)}&output=embed`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </div>
  ));
}
