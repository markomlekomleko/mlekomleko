"use client";

import { useLocalize, useLocale } from "@/app/lib/i18n/client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useCart } from "./cart-provider";
import { CookieSettingsButton } from "./analytics-provider";
import { MotionToggle } from "./motion-toggle";
import { LanguageSwitcher } from "./language-switcher";
import { translate, toCyrillic } from "../lib/i18n/translate";
import { shellCopy } from "../lib/content";

// One source for the contact pair the footer and the mobile menu both show.
const PHONE = { href: "tel:+381605022323", label: "060 502 23 23" };
const INSTAGRAM_URL = "https://instagram.com/mleko_i_mleko";

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
};

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
  // Only one overlay is ever active: the cart takes precedence over the menu.
  const menuVisible = menuOpen && !drawerOpen;

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
    <div className="site-header-stack" data-hero-header>
      {settings.announcementEnabled && announcementText.trim() ? <aside className="announcement-bar" aria-label="Obaveštenje">
        {announcementUrl ? <a href={announcementUrl} target={externalAnnouncement ? "_blank" : undefined} rel={externalAnnouncement ? "noopener noreferrer" : undefined}>{announcementText}</a> : <p>{announcementText}</p>}
      </aside> : null}
      <header className="site-header">
        <div className="nav-shell">
          <button ref={menuButton} id="menu-toggle" className="mobile-menu-button" type="button" aria-label="Meni" aria-expanded={menuVisible} aria-controls="glavna-navigacija" onClick={() => setMenuOpen((current) => !current)}>
            <span className={`menu-lines ${menuVisible ? "is-open" : ""}`} aria-hidden="true"><span /><span /></span>
          </button>
          <nav id="glavna-navigacija" className={`main-nav ${menuVisible ? "is-open" : ""}`} aria-label="Glavna navigacija">
            <Link href="/prodavnica">Mleko</Link>
            <Link href="/kako-funkcionise">Kako dostavljamo</Link>
            <Link href="/farme">Naše poreklo</Link>
            <Link className="nav-support" href="/faq">Česta pitanja</Link>
            <Link className="nav-support" href="/kontakt">Kontakt</Link>
            <Link className="mobile-account" href="/nalog">Moj nalog</Link>
            <p className="nav-contact">
              <a href={PHONE.href}>{PHONE.label}</a>
              <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer">Instagram ↗</a>
            </p>
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
            <Link className="header-account" href="/nalog">Moj nalog</Link>
            <button className="cart-link" type="button" onClick={openDrawer} aria-label={ready && count > 0 ? `Korpa, ${count} jedinica` : "Korpa"}>
              Korpa
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

export function SiteFooter({ storeName = "Mleko i Mleko" }: { storeName?: string }) {
  const localize = useLocalize();
  return localize((
    <footer className="site-footer">
      <div className="page-shell footer-grid">
        <div className="footer-brand-col">
          <Link className="brand footer-brand" href="/" aria-label={`${storeName} - početna`}>
            <Image
              className="brand-logo brand-logo-footer"
              src="/images/mleko-i-mleko-logo-mark.png"
              alt=""
              width={140}
              height={140}
              sizes="88px"
            />
          </Link>
          <p className="footer-tagline">{shellCopy.footer.tagline}</p>
          <p className="footer-contact">
            <a href={PHONE.href}>{PHONE.label}</a>
            <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer">Instagram ↗</a>
          </p>
        </div>
        <nav className="footer-links" aria-labelledby="footer-istrazi">
          <h2 id="footer-istrazi">{shellCopy.footer.exploreTitle}</h2>
          <Link href="/prodavnica">Prodavnica</Link>
          <Link href="/gde-kupiti">Gde kupiti</Link>
          <Link href="/dostava-mleka/beograd">Dostava Beograd</Link>
          <Link href="/dostava-mleka/novi-sad">Dostava Novi Sad</Link>
          <Link href="/farme">Naše farme</Link>
          <Link href="/faq">Česta pitanja</Link>
          <Link href="/kontakt">Kontakt</Link>
        </nav>
        <nav className="footer-links" aria-labelledby="footer-sitna-slova">
          <h2 id="footer-sitna-slova">{shellCopy.footer.infoTitle}</h2>
          <Link href="/uslovi-kupovine">Uslovi kupovine</Link>
          <Link href="/privatnost">Privatnost i kolačići</Link>
          <Link href="/dostava">Dostava</Link>
          <Link href="/reklamacije">Reklamacije i povraćaj</Link>
          <Link href="/pravila-pretplate">Pravila pretplate</Link>
          <CookieSettingsButton />
          <MotionToggle />
        </nav>
      </div>
      {/* Decorative: the brand name is already the logo link's accessible name. */}
      <div className="footer-bottom">
        <div className="page-shell footer-wordmark-wrap">
          <p className="footer-wordmark" aria-hidden="true">{shellCopy.footer.wordmark}</p>
        </div>
      </div>
    </footer>
  ));
}
