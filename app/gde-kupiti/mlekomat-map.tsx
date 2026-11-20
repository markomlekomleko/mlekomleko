"use client";

import { useLocalize, useLocale } from "@/app/lib/i18n/client";
import { translate } from "@/app/lib/i18n/translate";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";

export type Mlekomat = {
  name: string;
  /** Street address shown under the name; empty until confirmed. */
  address?: string;
  /** What Google Maps searches for; the place's name plus city finds the listing. */
  query: string;
  milk: string;
  lat: number;
  lng: number;
};

const mapLink = (query: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
const directions = (query: string) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;

/** A brand pin: a navy drop with the cow-and-goat teal dot, drawn in CSS. */
const pinHtml = (label: string) => `<span class="mlekomat-pin" aria-hidden="true"></span><span class="visually-hidden">${label}</span>`;

/**
 * All mlekomats on one map (18 Nov 2026): Leaflet with OpenStreetMap tiles (softened in
 * CSS to the brand palette), one brand pin
 * per location and the map framed so every pin shows. Picking a location in the list
 * flies there and opens its popup; "Put do mene" still opens Google Maps directions
 * from the visitor's own position, so the site never asks for their location.
 */
export function MlekomatMap({ locations }: { locations: readonly Mlekomat[] }) {
  const localize = useLocalize();
  const locale = useLocale();
  const [active, setActive] = useState<number | null>(null);
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const markers = useRef<Marker[]>([]);

  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !holder.current || map.current) return;
      const instance = L.map(holder.current, { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(instance);
      markers.current = locations.map((place, index) =>
        L.marker([place.lat, place.lng], {
          icon: L.divIcon({ className: "mlekomat-pin-wrap", html: pinHtml(translate(place.name, locale)), iconSize: [34, 44], iconAnchor: [17, 42], popupAnchor: [0, -38] }),
          title: translate(place.name, locale),
          keyboard: true,
        })
          .addTo(instance)
          .bindPopup(`<strong>${translate(place.name, locale)}</strong><br>${translate(place.milk, locale)}`)
          .on("click", () => setActive(index)),
      );
      instance.fitBounds(L.latLngBounds(locations.map((place) => [place.lat, place.lng])), { padding: [48, 48], maxZoom: 14 });
      map.current = instance;
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, [locations, locale]);

  function focus(index: number) {
    setActive(index);
    const place = locations[index];
    map.current?.flyTo([place.lat, place.lng], 15, { duration: 0.8 });
    markers.current[index]?.openPopup();
  }

  return localize((
    <div className="mlekomat-map">
      <ul className="mlekomat-list">
        {locations.map((place, index) => (
          <li key={place.name} data-active={index === active}>
            <button type="button" aria-pressed={index === active} onClick={() => focus(index)}>
              <strong>{place.name}</strong>
              {place.address ? <span className="mlekomat-address">{place.address}</span> : null}
              <span>{place.milk}</span>
            </button>
            <span className="mlekomat-links">
              <a className="text-link" href={mapLink(place.query)} target="_blank" rel="noreferrer">Otvori mapu ↗</a>
              <a className="text-link" href={directions(place.query)} target="_blank" rel="noreferrer">Put do mene ↗</a>
            </span>
          </li>
        ))}
      </ul>
      <div className="mlekomat-frame">
        <div ref={holder} className="mlekomat-leaflet" role="region" aria-label="Mapa mlekomata u Beogradu" />
      </div>
    </div>
  ));
}
