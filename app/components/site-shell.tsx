"use client";

import { useLocalize, useLocale } from "@/app/lib/i18n/client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { useCart } from "./cart-provider";
import { CookieSettingsButton } from "./analytics-provider";
import { LanguageSwitcher } from "./language-switcher";
import { translate, toCyrillic } from "../lib/i18n/translate";
import { shellCopy } from "../lib/content";
import { company, companyLine } from "../lib/company";

// One source for the contact pair the footer and the mobile menu both show.
const PHONE = { href: company.phoneHref, label: company.phone };
export const INSTAGRAM_URL = "https://instagram.com/mleko_i_mleko";
export const TIKTOK_URL = "https://www.tiktok.com/@mleko_i_mleko";

export type HeaderSettings = {
  storeName: string;
  announcementEnabled: boolean;
  announcementText: string;
  announcementLinkLabel: string;
  announcementTextEn?: string;
  announcementTextRu?: string;
  announcementTextSrCyrl?: string;
  announcementUrl: string;
  storeDemoMode: boolean;
  serviceAreaNote: string;
  /** Next orderable delivery per city, as a UTC instant, computed on the server. */
  deliveryCountdowns?: DeliveryCountdown[];
};

export type DeliveryCountdown = { city: string; slots: { date: string; weekday: number; cutoffAt: string }[] };

const pad = (value: number) => String(value).padStart(2, "0");
const WEEKDAYS = ["nedelja", "ponedeljak", "utorak", "sreda", "četvrtak", "petak", "subota"];

/** "2d 14:03:09", or "14:03:09" in the last day. */
function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86_400);
  const clock = `${pad(Math.floor((total % 86_400) / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  return days ? `${days}d ${clock}` : clock;
}

// One clock per city, counting down to the change deadline of that city's next delivery
// (36 h before the 07:00 route start, enforced by the server). The server sends the next
// few deadlines, so when one passes the clock moves on to the next delivery by itself.
// The first render shows placeholders so the server and the browser agree.
function DeliveryCountdowns({ items }: { items: DeliveryCountdown[] }) {
  const localize = useLocalize();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, []);
  const live = items
    .map((item) => ({ city: item.city, slot: item.slots.find((slot) => now === null || Date.parse(slot.cutoffAt) > now) }))
    .filter((item): item is { city: string; slot: DeliveryCountdown["slots"][number] } => Boolean(item.slot));
  if (!live.length) return null;
  return localize((
    <p className="delivery-countdowns">
      <span className="delivery-countdowns-label">Rok za izmene:</span>
      {live.map(({ city, slot }) => (
        <span className="delivery-countdown" key={city}>
          <span className="delivery-countdown-city">{city}</span>{" "}
          <span className="delivery-countdown-day">({WEEKDAYS[slot.weekday]})</span>{" "}
          <time dateTime={slot.cutoffAt}>{now === null ? "··:··:··" : formatCountdown(Date.parse(slot.cutoffAt) - now)}</time>
        </span>
      ))}
    </p>
  ));
}

export function SiteHeader({ settings }: { settings: HeaderSettings }) {
  const localize = useLocalize();
  const locale = useLocale();
  const { count, ready, openDrawer, drawerOpen } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const announcementText = locale === "en" ? settings.announcementTextEn || translate(settings.announcementText, locale)
    : locale === "ru" ? settings.announcementTextRu || translate(settings.announcementText, locale)
    : locale === "sr-cyrl" ? settings.announcementTextSrCyrl || toCyrillic(settings.announcementText) : settings.announcementText;
  const announcementUrl = settings.announcementUrl.trim();
  const externalAnnouncement = /^https:\/\//i.test(announcementUrl);
  const showAnnouncement = settings.announcementEnabled && Boolean(announcementText.trim());
  const countdowns = settings.deliveryCountdowns ?? [];
  // Only one overlay is ever active: the cart takes precedence over the menu.
  const menuVisible = menuOpen && !drawerOpen;
  const stackRef = useRef<HTMLDivElement>(null);
  const [navFit, setNavFit] = useState<"relaxed" | "tight" | "collapsed">("relaxed");

  // Desktop links must never wrap or run into the actions, whatever the language, the
  // system font or the browser zoom. Measure the real layout: first tighten the links,
  // and if even that does not fit, fall back to the menu sheet used on smaller screens.
  useEffect(() => {
    const stack = stackRef.current;
    if (!stack) return;
    const overflows = () => {
      const nav = stack.querySelector<HTMLElement>("#glavna-navigacija");
      const actions = stack.querySelector<HTMLElement>(".header-actions");
      if (!nav || !actions) return false;
      const links = [...nav.querySelectorAll<HTMLElement>(":scope > a")].filter((link) => link.offsetParent !== null);
      if (!links.length) return false;
      const heights = links.map((link) => link.getBoundingClientRect().height);
      const wrapped = Math.max(...heights) > Math.min(...heights) * 1.5;
      return wrapped || links[links.length - 1].getBoundingClientRect().right + 16 > actions.getBoundingClientRect().left;
    };
    const check = () => {
      stack.removeAttribute("data-nav-tight");
      stack.removeAttribute("data-nav-collapsed");
      if (!window.matchMedia("(min-width: 1024px)").matches) { setNavFit("relaxed"); return; }
      let fit: "relaxed" | "tight" | "collapsed" = "relaxed";
      if (overflows()) {
        stack.setAttribute("data-nav-tight", "");
        fit = "tight";
        if (overflows()) {
          stack.removeAttribute("data-nav-tight");
          stack.setAttribute("data-nav-collapsed", "");
          fit = "collapsed";
        }
      }
      setNavFit(fit);
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(stack);
    window.addEventListener("resize", check);
    document.fonts?.ready.then(check).catch(() => {});
    return () => { observer.disconnect(); window.removeEventListener("resize", check); };
  }, [locale]);
  // Closes the menu; for a link to a section of the page already open (the milk picker on
  // the home page) it also scrolls there itself, because the router does nothing when
  // the URL already carries that same hash.
  const closeMenu = (event?: ReactMouseEvent<HTMLAnchorElement>) => {
    setMenuOpen(false);
    const link = event?.currentTarget;
    if (!link || !link.hash) return;
    const url = new URL(link.href);
    if (url.pathname.replace(/\/$/, "") !== window.location.pathname.replace(/\/$/, "")) return;
    const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
    if (!target) return;
    event.preventDefault();
    history.replaceState(null, "", url.pathname + url.search + url.hash);
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuOpen(false); menuButton.current?.focus(); }
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [menuOpen]);

  // DOM order is the visual order at every width (menu button, links, logo, actions),
  // so the tab order never jumps around the bar.
  return localize((
    <div ref={stackRef} className="site-header-stack" data-hero-header data-nav-tight={navFit === "tight" ? "" : undefined} data-nav-collapsed={navFit === "collapsed" ? "" : undefined}>
      {showAnnouncement || countdowns.length ? <aside className="announcement-bar" aria-label="Obaveštenje">
        {showAnnouncement ? announcementUrl ? <a href={announcementUrl} target={externalAnnouncement ? "_blank" : undefined} rel={externalAnnouncement ? "noopener noreferrer" : undefined}>{announcementText}</a> : <p>{announcementText}</p> : null}
        {countdowns.length ? <DeliveryCountdowns items={countdowns} /> : null}
      </aside> : null}
      <header className="site-header">
        <div className="nav-shell">
          <button ref={menuButton} id="menu-toggle" className="mobile-menu-button" type="button" aria-label="Meni" aria-expanded={menuVisible} aria-controls="glavna-navigacija" onClick={() => setMenuOpen((current) => !current)}>
            <span className={`menu-lines ${menuVisible ? "is-open" : ""}`} aria-hidden="true"><span /><span /></span>
          </button>
          {/* Every link closes the menu: a same-page hash link (the milk picker on the
              home page) would otherwise leave it covering the section. */}
          <nav id="glavna-navigacija" className={`main-nav ${menuVisible ? "is-open" : ""}`} aria-label="Glavna navigacija">
            <Link onClick={closeMenu} href="/">Početna</Link>
            <Link onClick={closeMenu} href="/prodavnica">Izaberi svoje mleko</Link>
            <Link onClick={closeMenu} href="/gde-kupiti">Mlekomati</Link>
            <Link onClick={closeMenu} href="/o-nama">O nama</Link>
            <Link onClick={closeMenu} href="/analize">Analize</Link>
            <Link onClick={closeMenu} className="mobile-account" href="/nalog">Moj nalog</Link>
          </nav>
          <Link className="brand" href="/" aria-label={`${settings.storeName} - početna`}>
            {/* The goat and cow and the hand-drawn wordmark from mlekoimleko.rs, their
                white parts recoloured to logo teal so they read on the white header. */}
            <Image
              className="brand-animals"
              src="/images/mleko-i-mleko-animals.png"
              alt=""
              width={600}
              height={318}
              sizes="104px"
            />
            <Image
              className="brand-wordmark"
              src="/images/mleko-i-mleko-wordmark.png"
              alt=""
              width={687}
              height={286}
              sizes="132px"
            />
          </Link>
          <div className="header-actions">
            <LanguageSwitcher />
            <Link className="header-account" href="/nalog" aria-label="Moj nalog" title="Moj nalog">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4.2 3.6-7 8-7s8 2.8 8 7" />
              </svg>
            </Link>
            <button className="cart-link" type="button" onClick={openDrawer} aria-label={ready && count > 0 ? `Napuni frižider, ${count} jedinica` : "Napuni frižider"}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M3 3h2l2.4 12h11.2l2-8H6" />
                <circle cx="9" cy="20" r="1" />
                <circle cx="18" cy="20" r="1" />
              </svg>
              {ready && count > 0 ? (
                <span className="cart-count" aria-hidden="true">
                  {count}
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </header>
    </div>
  ));
}

/** Small line icons for the footer contacts; decorative, the link text names the target. */
function FooterIcon({ name }: { name: "phone" | "mail" | "instagram" | "tiktok" }) {
  const paths: Record<typeof name, ReactNode> = {
    phone: <path d="M6.6 3.5h3l1.5 4-2 1.3a11 11 0 0 0 6.1 6.1l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A17.6 17.6 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z" />,
    mail: <><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="m3.5 7 8.5 6.2L20.5 7" /></>,
    instagram: <><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" /></>,
    tiktok: <path d="M14 3.5v11.2a3.8 3.8 0 1 1-3.3-3.8M14 3.5c.4 2.6 2.2 4.4 5 4.6" />,
  };
  return (
    <svg className="footer-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}

export function SiteFooter() {
  const localize = useLocalize();
  const legal = companyLine();
  // Spec 19 Nov 2026, §15: contact, company details, social networks and the legal
  // pages. Contact lives here, easy to reach, instead of in the main menu.
  return localize((
    <footer className="site-footer site-footer--k">
      <div className="page-shell footer-k-grid">
        <div className="footer-brand-col">
          <Image className="brand-logo-footer" src="/images/mleko-i-mleko-logo.png" alt="Mleko i Mleko" width={96} height={96} sizes="96px" />
          <p className="footer-tagline">{shellCopy.footer.tagline}</p>
        </div>
        <nav className="footer-links" aria-labelledby="footer-contact-title">
          <h2 id="footer-contact-title">Kontakt</h2>
          <Link href="/kontakt">Piši nam</Link>
          <a className="footer-contact" href={PHONE.href}><FooterIcon name="phone" /><span>{PHONE.label}</span></a>
          {company.email ? <a className="footer-contact" href={`mailto:${company.email}`}><FooterIcon name="mail" /><span data-no-translate>{company.email}</span></a> : null}
          <a className="footer-contact" href={INSTAGRAM_URL} target="_blank" rel="noreferrer"><FooterIcon name="instagram" /><span>Instagram</span></a>
          <a className="footer-contact" href={TIKTOK_URL} target="_blank" rel="noreferrer"><FooterIcon name="tiktok" /><span>TikTok</span></a>
        </nav>
        <nav className="footer-links" aria-labelledby="footer-milk-title">
          <h2 id="footer-milk-title">Mleko i Mleko</h2>
          <Link href="/prodavnica">Izaberi svoje mleko</Link>
          <Link href="/gde-kupiti">Mlekomati</Link>
          <Link href="/o-nama">O nama</Link>
          <Link href="/analize">Analize</Link>
          <Link href="/kako-funkcionise">Kako funkcioniše pretplata</Link>
          <Link href="/farme">Poreklo tvog mleka</Link>
          <Link href="/faq">Česta pitanja</Link>
        </nav>
        <nav className="footer-links" aria-labelledby="footer-legal-title">
          <h2 id="footer-legal-title">{shellCopy.footer.infoTitle}</h2>
          <Link href="/uslovi-kupovine">Uslovi kupovine</Link>
          <Link href="/pravila-pretplate">Pravila pretplate</Link>
          <Link href="/dostava">Dostava</Link>
          <Link href="/reklamacije">Reklamacije i povraćaj</Link>
          <Link href="/privatnost">Privatnost i kolačići</Link>
          <CookieSettingsButton />
        </nav>
      </div>
      <div className="page-shell footer-k-legal">
        <p className="footer-company">
          {company.legalName ? <span data-no-translate>{company.legalName}</span> : null}
          {legal.map((part) => <span key={part}> · {part}</span>)}
        </p>
        <p className="footer-pay">Plaćanje: gotovinom pri dostavi ili uplatom na račun.</p>
      </div>
    </footer>
  ));
}
