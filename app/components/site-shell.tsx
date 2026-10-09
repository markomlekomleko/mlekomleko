"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useCart } from "./cart-provider";
import { CookieSettingsButton } from "./analytics-provider";
import { Marquee } from "./marquee";
import { MotionToggle } from "./motion-toggle";
import { shellCopy } from "../lib/content";

// One source for the contact pair the footer and the mobile menu both show.
const PHONE = { href: "tel:+381605022323", label: "060 502 23 23" };
const INSTAGRAM_URL = "https://instagram.com/mleko_i_mleko";

export type HeaderSettings = {
  storeName: string;
  announcementEnabled: boolean;
  announcementText: string;
  announcementLinkLabel: string;
  announcementUrl: string;
  storeDemoMode: boolean;
  serviceAreaNote: string;
};

export function SiteHeader({ settings }: { settings: HeaderSettings }) {
  const { count, ready, openDrawer, drawerOpen } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const isVideoAnnouncement = /(?:tiktok\.com|youtu\.?be)/i.test(settings.announcementUrl);
  // Only one overlay is ever active: the cart takes precedence over the menu.
  const menuVisible = menuOpen && !drawerOpen;
  // The real delivery days live in settings, so the copy deck never names a weekday.
  const serviceNote = settings.serviceAreaNote.trim().replace(/\.$/, "");
  const tickerItems = serviceNote ? [...shellCopy.tickerItems, serviceNote] : [...shellCopy.tickerItems];

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
  return (
    <div className="site-header-stack">
      <aside className="ticker-bar" aria-label="Obaveštenja">
        <MotionToggle />
        <Marquee variant="ticker" items={tickerItems} label={settings.storeName} className="ticker-bar-marquee" />
        {settings.announcementEnabled && settings.announcementText ? (
          <a
            className="ticker-pin"
            href={settings.announcementUrl}
            target={isVideoAnnouncement ? "_blank" : undefined}
            rel={isVideoAnnouncement ? "noreferrer" : undefined}
          >
            <span className="ticker-pin-text">{settings.announcementText}</span>{" "}
            <span className="ticker-pin-label">
              {settings.announcementLinkLabel}
              <span aria-hidden="true"> →</span>
            </span>
          </a>
        ) : null}
      </aside>
      <header className="site-header">
        <div className="nav-shell">
          <button ref={menuButton} id="menu-toggle" className="mobile-menu-button" type="button" aria-label="Meni" aria-expanded={menuVisible} aria-controls="glavna-navigacija" onClick={() => setMenuOpen((current) => !current)}>
            <span className={`menu-lines ${menuVisible ? "is-open" : ""}`} aria-hidden="true"><span /><span /></span>
          </button>
          <nav id="glavna-navigacija" className={`main-nav ${menuVisible ? "is-open" : ""}`} aria-label="Glavna navigacija">
            <a href="/prodavnica">Mleko</a>
            <a href="/kako-funkcionise">Kako dostavljamo</a>
            <a href="/farme">Naše poreklo</a>
            <a className="nav-support" href="/faq">Česta pitanja</a>
            <a className="nav-support" href="/kontakt">Kontakt</a>
            <a className="mobile-account" href="/nalog">Moj nalog</a>
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
            <a className="header-account" href="/nalog">Moj nalog</a>
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
  );
}

export function SiteFooter({ storeName = "Mleko i Mleko" }: { storeName?: string }) {
  return (
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
          <a href="/prodavnica">Prodavnica</a>
          <a href="/gde-kupiti">Gde kupiti</a>
          <a href="/dostava-mleka/beograd">Dostava Beograd</a>
          <a href="/dostava-mleka/novi-sad">Dostava Novi Sad</a>
          <a href="/farme">Naše farme</a>
          <a href="/faq">Česta pitanja</a>
          <a href="/kontakt">Kontakt</a>
        </nav>
        <nav className="footer-links" aria-labelledby="footer-sitna-slova">
          <h2 id="footer-sitna-slova">{shellCopy.footer.infoTitle}</h2>
          <a href="/uslovi-kupovine">Uslovi kupovine</a>
          <a href="/privatnost">Privatnost i kolačići</a>
          <a href="/dostava">Dostava</a>
          <a href="/reklamacije">Reklamacije i povraćaj</a>
          <a href="/pravila-pretplate">Pravila pretplate</a>
          <CookieSettingsButton />
        </nav>
      </div>
      {/* Decorative: the brand name is already the logo link's accessible name. */}
      <div className="footer-bottom">
        <div className="page-shell footer-wordmark-wrap">
          <p className="footer-wordmark" aria-hidden="true">{shellCopy.footer.wordmark}</p>
        </div>
      </div>
    </footer>
  );
}
