"use client";

/* eslint-disable @next/next/no-img-element -- Slides are pre-optimised local photography. */
import { useLocalize } from "@/app/lib/i18n/client";
import { useRef, useState } from "react";
import type { Product } from "../lib/frontend";

export type MilkKind = "cow" | "goat";

type Slide =
  | { type: "image"; src: string; alt: string; caption: string }
  | { type: "story"; title: string; points: readonly string[] };

/** Cow or goat, from the catalog slug; anything else gets no carousel. */
export function milkKind(product: Pick<Product, "slug" | "name">): MilkKind | null {
  const text = `${product.slug} ${product.name}`.toLowerCase();
  if (/koz/.test(text)) return "goat";
  if (/krav/.test(text)) return "cow";
  return null;
}

/**
 * Same order for both milks, so the two cards read as a pair; only the art and the
 * colour differ (meeting 17 Nov 2026). The images are temporary Higgsfield renders;
 * the client sends the final set, which replaces the files under
 * public/images/karusel/ without touching this component.
 */
const slides: Record<MilkKind, readonly Slide[]> = {
  cow: [
    { type: "image", src: "/images/karusel/kravlje-flasa.webp", alt: "Staklena flaša domaćeg kravljeg mleka", caption: "Domaće kravlje mleko" },
    { type: "image", src: "/images/karusel/kravlje-krava.webp", alt: "Krava na pašnjaku", caption: "Sa domaćih farmi" },
    { type: "story", title: "Šta je u flaši", points: ["Punomasno i sirovo", "Bez dodataka i bez obiranja", "Muženo i flaširano za tvoju dostavu"] },
    { type: "image", src: "/images/karusel/kravlje-casa.webp", alt: "Mleko se sipa iz staklene flaše u čašu", caption: "Staklo koje se vraća" },
  ],
  goat: [
    { type: "image", src: "/images/karusel/kozje-flasa.webp", alt: "Staklena flaša domaćeg kozjeg mleka", caption: "Domaće kozje mleko" },
    { type: "image", src: "/images/karusel/kozje-koza.webp", alt: "Koza na pašnjaku", caption: "Sa domaćih farmi" },
    { type: "story", title: "Šta je u flaši", points: ["Punomasno i sirovo", "Bez dodataka i bez obiranja", "Blago i lako svarljivo"] },
    { type: "image", src: "/images/karusel/kozje-casa.webp", alt: "Flaša kozjeg mleka i čaša na stolu", caption: "Staklo koje se vraća" },
  ],
};

export function ProductCarousel({ kind, name }: { kind: MilkKind; name: string }) {
  const localize = useLocalize();
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const items = slides[kind];

  function go(index: number) {
    const el = track.current;
    if (!el) return;
    const next = (index + items.length) % items.length;
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  }

  return localize((
    <div className="carousel" data-kind={kind} role="region" aria-roledescription="karusel" aria-label={`Fotografije: ${name}`}>
      {/* Focusable so keyboard users can scroll the slides with the arrow keys
          (axe scrollable-region-focusable); it is a named group, not decoration. */}
      <div
        ref={track}
        className="carousel-track"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard-reachable
        tabIndex={0}
        role="group"
        aria-label={`Fotografije: ${name}`}
        onScroll={(event) => {
          const el = event.currentTarget;
          setActive(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
      >
        {items.map((slide, index) => (
          <div className="carousel-slide" key={index} role="group" aria-roledescription="slajd" aria-label={`${index + 1} / ${items.length}`}>
            {slide.type === "image" ? (
              <>
                <img src={slide.src} alt={slide.alt} width="1080" height="1350" loading={index === 0 ? "eager" : "lazy"} />
                <p className="carousel-caption">{slide.caption}</p>
              </>
            ) : (
              <div className="carousel-story">
                <img className="carousel-story-mark" src={kind === "cow" ? "/images/brand/cow-white.png" : "/images/brand/goat-white.png"} alt="" width="120" height="90" />
                <h4>{slide.title}</h4>
                <ul>
                  {slide.points.map((point) => <li key={point}>{point}</li>)}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
      <button className="carousel-nav carousel-prev" type="button" aria-label="Prethodna fotografija" onClick={() => go(active - 1)}>‹</button>
      <button className="carousel-nav carousel-next" type="button" aria-label="Sledeća fotografija" onClick={() => go(active + 1)}>›</button>
      <div className="carousel-dots" aria-hidden="true">
        {items.map((_, index) => <span key={index} data-active={index === active} />)}
      </div>
    </div>
  ));
}
