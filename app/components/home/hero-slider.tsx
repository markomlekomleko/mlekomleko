"use client";

/* eslint-disable @next/next/no-img-element -- Pre-optimised local hero photographs. */
import { useLocalize } from "@/app/lib/i18n/client";
import { useEffect, useRef, useState } from "react";
import { homeCopy } from "../../lib/content";

type Slide = {
  image: string;
  /** Where the photo's subject sits, so a phone crop keeps it in frame. */
  focus: string;
  alt: string;
  eyebrow: string;
  title: string;
  lead: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
};

/**
 * The home hero after Kafeterija (18 Nov 2026): four full-width photo slides with a
 * headline, a line of copy and two actions, swiped or stepped with the arrows and dots,
 * advancing on their own every few seconds unless the visitor is reading (hover,
 * focus, touch) or asked for reduced motion. Replaces the scroll-linked video scene.
 */
const slides: readonly Slide[] = [
  {
    image: "/images/hero/mleko.webp",
    focus: "65% 50%",
    alt: "Mleko se sipa u čašu",
    eyebrow: "Domaće kravlje i kozje mleko",
    title: "Mleko koje znaš",
    lead: "Sirovo i punomasno, sa malih domaćih farmi, u povratnoj staklenoj flaši.",
    primary: { label: "Izaberi svoje mleko", href: "#izaberite-mleko" },
    secondary: { label: "Mesečna pretplata", href: "/kako-funkcionise" },
  },
  {
    image: "/images/hero/flase.webp",
    focus: "78% 60%",
    alt: "Flaše kravljeg i kozjeg mleka na drvenom stolu",
    eyebrow: "Mesečna pretplata",
    title: "Sveže mleko do praga",
    lead: "Biraš mleko i ritam — mi donosimo. Preskakanje i pauzu uređuješ na nalogu.",
    primary: { label: "Počni pretplatu", href: "#izaberite-mleko" },
    secondary: { label: "Saznaj više", href: "/kako-funkcionise" },
  },
  {
    image: "/images/hero/mlekomat.webp",
    focus: "50% 55%",
    alt: "Ljudi ispred mlekomata Mleko i Mleko u tržnom centru",
    eyebrow: "Mlekomati",
    title: "Natoči sebi pravo mleko.",
    lead: "Domaće mleko iz mlekomata u Beogradu — natočiš koliko ti treba i platiš na licu mesta, gotovinom ili karticom.",
    primary: { label: "Pronađi mlekomat", href: "/gde-kupiti" },
  },
  {
    image: "/images/hero/farma.webp",
    focus: "70% 60%",
    alt: "Krave na pašnjaku pored seoske kuće u svitanje",
    eyebrow: "Poreklo tvog mleka",
    title: "Sa paše do flaše",
    lead: "Biramo male domaće farme i radimo direktno sa domaćinima.",
    primary: { label: "Poreklo tvog mleka", href: "/farme" },
  },
];

const AUTOPLAY_MS = 6500;

export function HeroSlider() {
  const localize = useLocalize();
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [hold, setHold] = useState(false);

  function go(index: number) {
    const el = track.current;
    if (!el) return;
    const next = (index + slides.length) % slides.length;
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  }

  // Advance on a timer, unless the visitor is reading or prefers no motion.
  useEffect(() => {
    if (hold) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "paused";
    if (still) return;
    const timer = window.setTimeout(() => go(active + 1), AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [active, hold]);

  return localize((
    <section
      className="hero-slider"
      aria-roledescription="karusel"
      aria-label="Istaknuto"
      onMouseEnter={() => setHold(true)}
      onMouseLeave={() => setHold(false)}
      onFocus={() => setHold(true)}
      onBlur={() => setHold(false)}
      onTouchStart={() => setHold(true)}
    >
      <h1 id="hero-title" className="visually-hidden">{homeCopy.hero.title}</h1>
      <div
        ref={track}
        className="hero-track"
        onScroll={(event) => {
          const el = event.currentTarget;
          setActive(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
      >
        {slides.map((slide, index) => (
          <div
            key={slide.image}
            className="hero-slide"
            role="group"
            aria-roledescription="slajd"
            aria-label={`${index + 1} / ${slides.length}`}
            aria-hidden={index !== active ? true : undefined}
            inert={index !== active ? true : undefined}
          >
            <img
              className="hero-slide-image"
              src={slide.image}
              alt={slide.alt}
              style={{ objectPosition: slide.focus }}
              loading={index === 0 ? "eager" : "lazy"}
              fetchPriority={index === 0 ? "high" : "auto"}
            />
            <div className="page-shell hero-slide-copy">
              <p className="hero-slide-eyebrow">{slide.eyebrow}</p>
              <h2 className="hero-slide-title">{slide.title}</h2>
              <p className="hero-slide-lead">{slide.lead}</p>
              <div className="hero-slide-actions">
                <a className={`button hero-slide-primary${index === 0 ? " hero-cta" : ""}`} href={slide.primary.href}>{slide.primary.label}</a>
                {slide.secondary ? <a className="button hero-slide-secondary" href={slide.secondary.href}>{slide.secondary.label}</a> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="hero-arrow hero-arrow-prev" aria-label="Prethodni slajd" onClick={() => go(active - 1)}>
        <span aria-hidden="true">←</span>
      </button>
      <button type="button" className="hero-arrow hero-arrow-next" aria-label="Sledeći slajd" onClick={() => go(active + 1)}>
        <span aria-hidden="true">→</span>
      </button>
      <div className="hero-dots">
        {slides.map((slide, index) => (
          <button
            key={slide.image}
            type="button"
            aria-label={`Slajd ${index + 1}`}
            aria-current={index === active ? "true" : undefined}
            onClick={() => go(index)}
          />
        ))}
      </div>
    </section>
  ));
}
