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
  const { count, ready } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const isVideoAnnouncement = /(?:tiktok\.com|youtu\.?be)/i.test(settings.announcementUrl);

  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuOpen(false); menuButton.current?.focus(); }
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [menuOpen]);

  return (
    <>
      <div className="delivery-bar"><span>Dostava na kućnu adresu</span><span>{settings.serviceAreaNote}</span></div>
      {settings.announcementEnabled && settings.announcementText && !isVideoAnnouncement ? (
        <aside className="announcement-bar" aria-label="Važno obaveštenje">
          <a href={settings.announcementUrl}>
            <span>{settings.announcementText}</span>
            <strong>{settings.announcementLinkLabel} →</strong>
          </a>
        </aside>
      ) : null}
      <header className="site-header">
        <div className="nav-shell">
          <Link className="brand" href="/" aria-label={`${settings.storeName} - početna`}>
            <Image
              className="brand-logo brand-logo-header"
              src="/images/mleko-i-mleko-logo.png"
              alt=""
              width={76}
              height={76}
              sizes="76px"
            />
            <span className="brand-name">{settings.storeName}</span>
            {settings.storeDemoMode ? <small>DEMO</small> : null}
          </Link>
          <nav id="glavna-navigacija" className={`main-nav ${menuOpen ? "is-open" : ""}`} aria-label="Glavna navigacija">
            <a href="/prodavnica">Prodavnica</a>
            <a href="/kako-funkcionise">Kako funkcioniše</a>
            <a href="/farme">Naše farme</a>
            <a className="nav-support" href="/faq">FAQ</a>
            <a className="nav-support" href="/kontakt">Kontakt</a>
            <a className="mobile-account" href="/nalog">Nalog</a>
          </nav>
          <div className="header-actions">
            <a className="header-shop" href="/prodavnica">Izaberi mleko ↗</a>
            <a className="header-account" href="/nalog">Nalog</a>
            <a className="cart-link" href="/korpa">
              Korpa
              {ready && count > 0 ? (
                <span className="cart-count" aria-label={`${count} stavki u korpi`}>
                  {count}
                </span>
              ) : null}
            </a>
          </div>
          <button ref={menuButton} id="menu-toggle" className="mobile-menu-button" type="button" aria-label="Meni" aria-expanded={menuOpen} aria-controls="glavna-navigacija" onClick={() => setMenuOpen((current) => !current)}>
            <span className={`menu-lines ${menuOpen ? "is-open" : ""}`} aria-hidden="true"><span /><span /></span>
          </button>
        </div>
      </header>
    </>
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
              src="/images/mleko-i-mleko-logo.png"
              alt=""
              width={82}
              height={82}
              sizes="82px"
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
