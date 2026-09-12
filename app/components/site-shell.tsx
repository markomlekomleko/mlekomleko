"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useCart } from "./cart-provider";
import { CookieSettingsButton } from "./analytics-provider";

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

  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuOpen(false); menuButton.current?.focus(); }
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [menuOpen]);

  return (
    <div className="site-header-stack">
      {settings.announcementEnabled && settings.announcementText ? (
        <aside className="announcement-bar" aria-label="Važno obaveštenje">
          <a href={settings.announcementUrl} target={isVideoAnnouncement ? "_blank" : undefined} rel={isVideoAnnouncement ? "noreferrer" : undefined}>
            <span>{settings.announcementText}</span>
            <strong>{settings.announcementLinkLabel} →</strong>
          </a>
        </aside>
      ) : <div className="delivery-bar"><span>Dostava na kućnu adresu</span><span>{settings.serviceAreaNote}</span></div>}
      <header className="site-header">
        <div className="nav-shell">
          <Link className="brand" href="/" aria-label={`${settings.storeName} - početna`}>
            <Image
              className="brand-logo brand-logo-header"
              src="/images/mleko-i-mleko-logo-mark.png"
              alt=""
              width={120}
              height={120}
              sizes="60px"
            />
            <span className="brand-name">{settings.storeName}</span>
          </Link>
          <nav id="glavna-navigacija" className={`main-nav ${menuVisible ? "is-open" : ""}`} aria-label="Glavna navigacija">
            <a href="/prodavnica">Mleko</a>
            <a href="/kako-funkcionise">Kako dostavljamo</a>
            <a href="/farme">Naše poreklo</a>
            <a className="nav-support" href="/faq">Česta pitanja</a>
            <a href="/kontakt">Kontakt</a>
            <a className="mobile-account" href="/nalog">Moj nalog</a>
          </nav>
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
          <button ref={menuButton} id="menu-toggle" className="mobile-menu-button" type="button" aria-label="Meni" aria-expanded={menuVisible} aria-controls="glavna-navigacija" onClick={() => setMenuOpen((current) => !current)}>
            <span className={`menu-lines ${menuVisible ? "is-open" : ""}`} aria-hidden="true"><span /><span /></span>
          </button>
        </div>
      </header>
    </div>
  );
}

export function SiteFooter({ storeName = "Mleko i Mleko" }: { storeName?: string }) {
  return (
    <footer className="site-footer">
      <div className="page-shell footer-grid">
        <div>
          <Link className="brand footer-brand" href="/" aria-label={`${storeName} - početna`}>
            <Image
              className="brand-logo brand-logo-footer"
              src="/images/mleko-i-mleko-logo-mark.png"
              alt=""
              width={140}
              height={140}
              sizes="70px"
            />
            <span>{storeName}</span>
          </Link>
          <p className="muted small-text">
            Domaće kravlje i kozje mleko u povratnim staklenim flašama.
          </p>
          <p className="small-text"><a href="tel:+381605022323">060 502 23 23</a> · <a href="https://instagram.com/mleko_i_mleko" target="_blank" rel="noreferrer">Instagram ↗</a></p>
        </div>
        <nav className="footer-links" aria-label="Istražite">
          <h2>Istražite</h2>
          <a href="/prodavnica">Prodavnica</a>
          <a href="/gde-kupiti">Gde kupiti</a>
          <a href="/dostava-mleka/beograd">Dostava Beograd</a>
          <a href="/dostava-mleka/novi-sad">Dostava Novi Sad</a>
          <a href="/farme">Naše farme</a>
          <a href="/faq">Česta pitanja</a>
          <a href="/kontakt">Kontakt</a>
        </nav>
        <nav className="footer-links" aria-label="Korisne informacije">
          <h2>Korisne informacije</h2>
          <a href="/uslovi-kupovine">Uslovi kupovine</a>
          <a href="/privatnost">Privatnost i kolačići</a>
          <a href="/dostava">Dostava</a>
          <a href="/reklamacije">Reklamacije i povraćaj</a>
          <a href="/pravila-pretplate">Pravila pretplate</a>
          <CookieSettingsButton />
        </nav>
      </div>
    </footer>
  );
}
