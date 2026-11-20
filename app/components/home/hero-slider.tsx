"use client";

/* eslint-disable @next/next/no-img-element -- Pre-optimised local hero photographs. */
import { useLocalize } from "@/app/lib/i18n/client";
import { useRef, useState } from "react";
import { homeCopy } from "../../lib/content";

type Action = { label: string; href: string; icon: string };

type Slide = {
  image: string;
  /** Where the photo's subject sits, so a phone crop keeps it in frame. */
  focus: string;
  alt: string;
  title: string;
  lead: string;
  actions: readonly Action[];
};

/** Google Maps list of the brand's own mlekomats, each with its real Google reviews. */
export const GOOGLE_REVIEWS_URL = "https://www.google.com/maps/search/?api=1&query=Mlekomat%20Mleko%20i%20Mleko";

/**
 * The home hero (spec 19 Nov 2026, §2): seven full-screen slides that slide in from the
 * right every three seconds, a centred headline, one line of copy and the slide's action
 * (two on the purchase-type slide, each opening the shop with that type chosen), with a
 * segmented progress bar that fills like a loading bar. The bar's own animation is the
 * timer: keyboard focus or a touch pauses it, reduced motion turns autoplay off. A copy
 * of the first slide sits after the last, so the loop always moves forward.
 * Slide 5 is the real photo of a partner farm family; the reviews slide links to the
 * real Google reviews and never quotes invented ones.
 */
const slides: readonly Slide[] = [
  {
    image: "/images/hero/mleko.webp",
    focus: "65% 50%",
    alt: "Mleko se sipa u čašu",
    title: "Mleko koje znaš.",
    lead: "Domaće sirovo mleko direktno sa farme, poznatog porekla, redovno testirano i dostavljeno na tvoja vrata.",
    actions: [{ icon: "🥛", label: "Izaberi svoje mleko", href: "/prodavnica" }],
  },
  {
    image: "/images/hero/mlekomat.webp",
    focus: "50% 55%",
    alt: "Ljudi ispred mlekomata Mleko i Mleko u tržnom centru",
    title: "Natoči sebi pravo mleko.",
    lead: "Pravo domaće mleko, bez odlaska na selo — na našim mlekomatima.",
    actions: [{ icon: "📍", label: "Pronađi svoj mlekomat", href: "/gde-kupiti" }],
  },
  {
    image: "/images/hero/paket.webp",
    focus: "70% 60%",
    alt: "Korpa sa staklenim flašama mleka i jedna flaša pored nje, na pragu kuće",
    title: "Ozbiljna veza ili avantura?",
    lead: "Pretplata sa redovnom dostavom ili jednokratna kupovina — ti biraš.",
    actions: [
      { icon: "💙", label: "Pretplata", href: "/prodavnica?tip=pretplata" },
      { icon: "✨", label: "Jednokratno", href: "/prodavnica?tip=jednokratno" },
    ],
  },
  {
    image: "/images/hero/flase.webp",
    focus: "78% 60%",
    alt: "Staklene flaše kravljeg i kozjeg mleka na drvenom stolu",
    title: "Pravo mleko zaslužuje staklo.",
    lead: "Povratne staklene flaše: praznu čistu flašu vratiš pri sledećoj dostavi, a mi donesemo punu.",
    actions: [{ icon: "🔁", label: "Pogledaj kako funkcioniše", href: "/kako-funkcionise" }],
  },
  {
    image: "/images/domacini/porodica-glisic.webp",
    focus: "50% 45%",
    alt: "Porodica Glišić ispred bala sena na svojoj farmi",
    title: "Znaš od koga piješ.",
    lead: "Pravi proizvođači i prave farme — ljudi koji iza svog mleka stoje imenom i prezimenom.",
    actions: [{ icon: "🐄", label: "Upoznaj naše farmere", href: "/o-nama#farmeri" }],
  },
  {
    image: "/images/hero/analize.webp",
    focus: "70% 50%",
    alt: "Uzorci mleka u epruvetama na laboratorijskom stolu",
    title: "Ne veruj nam na reč.",
    lead: "Redovne laboratorijske analize i transparentni izveštaji koje možeš sam da pogledaš.",
    actions: [{ icon: "🔬", label: "Uveri se i ti", href: "/analize" }],
  },
  {
    image: "/images/hero/utisci.webp",
    focus: "50% 40%",
    alt: "Porodica za doručkom, mama sipa mleko iz staklene flaše",
    title: "Vi najbolje pričate o nama. 💙",
    lead: "Pročitaj šta kažu naši kupci — stvarne recenzije na Google-u.",
    actions: [{ icon: "⭐", label: "Pogledaj utiske", href: GOOGLE_REVIEWS_URL }],
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
                <div className="hero-slide-actions">
                  {slide.actions.map((action, actionIndex) => {
                    const external = /^https:/.test(action.href);
                    return (
                      <a
                        key={action.href}
                        className={`hero-slide-action${index === 0 && actionIndex === 0 ? " hero-cta" : ""}`}
                        href={action.href}
                        target={external ? "_blank" : undefined}
                        rel={external ? "noopener noreferrer" : undefined}
                      >
                        <span aria-hidden="true">{action.icon}</span>
                        {action.label}
                      </a>
                    );
                  })}
                </div>
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
