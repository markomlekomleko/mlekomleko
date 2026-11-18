"use client";

/* eslint-disable @next/next/no-img-element -- Pre-optimised local hero photographs. */
import { useLocalize } from "@/app/lib/i18n/client";
import { useRef, useState } from "react";
import { homeCopy } from "../../lib/content";

type Slide = {
  image: string;
  /** Where the photo's subject sits, so a phone crop keeps it in frame. */
  focus: string;
  alt: string;
  title: string;
  lead: string;
  /** Small pictogram before the button label, decorative. */
  icon: string;
  action: { label: string; href: string };
};

/**
 * The home hero after Farmit (18 Nov 2026): full-screen photos that slide in from the
 * right every three seconds, a centred headline in sentence case, one line of copy, a
 * single white pill action with a pictogram, the same reassurance line under every
 * slide, and a segmented progress bar that fills like a loading bar. The bar's own
 * animation is the timer: keyboard focus or a touch pauses it, reduced motion turns
 * autoplay off. A copy of the first slide sits after the last, so the loop always
 * moves forward and then snaps back to the start unseen.
 */
const slides: readonly Slide[] = [
  {
    image: "/images/hero/mleko.webp",
    focus: "65% 50%",
    alt: "Mleko se sipa u čašu",
    title: "Mleko koje znaš.",
    lead: "Sirovo i punomasno, sa malih domaćih farmi, u povratnoj staklenoj flaši.",
    icon: "🥛",
    action: { label: "Izaberi svoje mleko", href: "#izaberite-mleko" },
  },
  {
    image: "/images/hero/flase.webp",
    focus: "78% 60%",
    alt: "Flaše kravljeg i kozjeg mleka na drvenom stolu",
    title: "Sveže mleko do praga.",
    lead: "Biraš mleko i ritam — mi donosimo. Preskakanje i pauzu uređuješ na nalogu.",
    icon: "🚚",
    action: { label: "Počni pretplatu", href: "#izaberite-mleko" },
  },
  {
    image: "/images/hero/mlekomat.webp",
    focus: "50% 55%",
    alt: "Ljudi ispred mlekomata Mleko i Mleko u tržnom centru",
    title: "Natoči sebi pravo mleko.",
    lead: "Domaće mleko iz mlekomata u Beogradu — natočiš koliko ti treba i platiš na licu mesta, gotovinom ili karticom.",
    icon: "📍",
    action: { label: "Pronađi mlekomat", href: "/gde-kupiti" },
  },
  {
    image: "/images/hero/farma.webp",
    focus: "70% 60%",
    alt: "Krave na pašnjaku pored seoske kuće u svitanje",
    title: "Sa paše do flaše.",
    lead: "Biramo male domaće farme i radimo direktno sa domaćinima.",
    icon: "🐄",
    action: { label: "Poreklo tvog mleka", href: "/farme" },
  },
];

const AUTOPLAY_MS = 3000;

export function HeroSlider() {
  const localize = useLocalize();
  // `position` runs 0..slides.length; slides.length is the copy of the first slide.
  const [position, setPosition] = useState(0);
  const [animate, setAnimate] = useState(true);
  const [hold, setHold] = useState(false);
  const touchX = useRef<number | null>(null);
  const active = position % slides.length;

  const go = (index: number) => {
    setAnimate(true);
    if (index < 0) {
      // Going back from the first slide: jump to the copy unseen, then slide back.
      setAnimate(false);
      setPosition(slides.length);
      requestAnimationFrame(() => requestAnimationFrame(() => { setAnimate(true); setPosition(slides.length - 1); }));
      return;
    }
    setPosition(Math.min(index, slides.length));
  };

  const all = [...slides, slides[0]];

  return localize((
    <section
      className="hero-slider"
      aria-roledescription="karusel"
      aria-label="Istaknuto"
      data-hold={hold ? "" : undefined}
      style={{ "--hero-autoplay": `${AUTOPLAY_MS}ms` } as React.CSSProperties}
      onFocus={() => setHold(true)}
      onBlur={() => setHold(false)}
      onTouchStart={(event) => { touchX.current = event.touches[0].clientX; setHold(true); }}
      onTouchEnd={(event) => {
        const start = touchX.current;
        touchX.current = null;
        setHold(false);
        if (start === null) return;
        const delta = event.changedTouches[0].clientX - start;
        if (Math.abs(delta) > 48) go(active + (delta < 0 ? 1 : -1));
      }}
    >
      <h1 id="hero-title" className="visually-hidden">{homeCopy.hero.title}</h1>
      <div
        className="hero-track"
        data-animate={animate ? "" : undefined}
        style={{ transform: `translateX(${position * -100}%)` }}
        onTransitionEnd={(event) => {
          if (event.target !== event.currentTarget || position !== slides.length) return;
          // Landed on the copy of the first slide: snap to the real one unseen.
          setAnimate(false);
          setPosition(0);
          requestAnimationFrame(() => requestAnimationFrame(() => setAnimate(true)));
        }}
      >
        {all.map((slide, index) => {
          const isCopy = index === slides.length;
          const current = index === position;
          return (
            <div
              key={isCopy ? `${slide.image}-copy` : slide.image}
              className="hero-slide"
              role={isCopy ? undefined : "group"}
              aria-roledescription={isCopy ? undefined : "slajd"}
              aria-label={isCopy ? undefined : `${index + 1} / ${slides.length}`}
              data-active={current ? "" : undefined}
              aria-hidden={!current || isCopy ? true : undefined}
              inert={!current ? true : undefined}
            >
              <img
                className="hero-slide-image"
                src={slide.image}
                alt={isCopy ? "" : slide.alt}
                style={{ objectPosition: slide.focus }}
                loading={index === 0 ? "eager" : "lazy"}
                fetchPriority={index === 0 ? "high" : "auto"}
              />
              <div className="page-shell hero-slide-copy">
                <h2 className="hero-slide-title">{slide.title}</h2>
                <p className="hero-slide-lead">{slide.lead}</p>
                <a className={`hero-slide-action${index === 0 ? " hero-cta" : ""}`} href={slide.action.href}>
                  <span aria-hidden="true">{slide.icon}</span>
                  {slide.action.label}
                </a>
                <p className="hero-slide-note">Dostava u Beogradu i Novom Sadu · povratne staklene flaše</p>
              </div>
            </div>
          );
        })}
      </div>
      <button type="button" className="hero-arrow hero-arrow-prev" aria-label="Prethodni slajd" onClick={() => go(active - 1)}>
        <span aria-hidden="true">‹</span>
      </button>
      <button type="button" className="hero-arrow hero-arrow-next" aria-label="Sledeći slajd" onClick={() => go(active + 1)}>
        <span aria-hidden="true">›</span>
      </button>
      <div className="hero-progress">
        {slides.map((slide, index) => (
          <button
            key={slide.image}
            type="button"
            aria-label={`Slajd ${index + 1}`}
            aria-current={index === active ? "true" : undefined}
            data-done={index < active ? "" : undefined}
            onClick={() => go(index)}
          >
            {index === active ? (
              <span key={active} className="hero-progress-fill" onAnimationEnd={() => go(active + 1)} />
            ) : null}
          </button>
        ))}
      </div>
    </section>
  ));
}
