"use client";
/* eslint-disable @next/next/no-img-element -- The official local raster logo is served directly in this vinext runtime. */

import Link from "next/link";
import { useCart } from "./cart-provider";

export type HeaderSettings = {
  storeName: string;
  announcementEnabled: boolean;
  announcementText: string;
  announcementLinkLabel: string;
  announcementUrl: string;
  storeDemoMode: boolean;
};

export function SiteHeader({ settings }: { settings: HeaderSettings }) {
  const { count, ready } = useCart();

  return (
    <>
      {settings.announcementEnabled && settings.announcementText ? (
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
            <img
              className="brand-logo brand-logo-header"
              src="/images/mleko-i-mleko-logo.png"
              alt=""
              width="4167"
              height="4167"
            />
            <span className="brand-name">{settings.storeName}</span>
            {settings.storeDemoMode ? <small>DEMO</small> : null}
          </Link>
          <nav className="main-nav" aria-label="Glavna navigacija">
            <a className="mobile-store" href="/prodavnica">Prodavnica</a>
            <a href="/kako-funkcionise">Kako funkcioniše</a>
            <a href="/o-nama">O nama</a>
            <a href="/faq">FAQ</a>
            <a href="/kontakt">Kontakt</a>
          </nav>
          <div className="header-actions">
            <a href="/prodavnica">Prodavnica</a>
            <a href="/nalog">Nalog</a>
            <a className="cart-link" href="/korpa">
              Korpa
              {ready && count > 0 ? (
                <span className="cart-count" aria-label={`${count} stavki u korpi`}>
                  {count}
                </span>
              ) : null}
            </a>
          </div>
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
            <img
              className="brand-logo brand-logo-footer"
              src="/images/mleko-i-mleko-logo.png"
              alt=""
              width="4167"
              height="4167"
            />
            <span>{storeName}</span>
          </Link>
          <p className="muted small-text">
            Domaće kravlje i kozje mleko u povratnim staklenim flašama.
          </p>
          <p className="small-text"><a href="tel:+381605022323">060 502 23 23</a> · <a href="https://instagram.com/mleko_i_mleko" target="_blank" rel="noreferrer">Instagram ↗</a></p>
        </div>
        <div className="footer-links" aria-label="Dodatne stranice">
          <a href="/gde-kupiti">Gde kupiti</a>
          <a href="/farme">Naše farme</a>
          <a href="/faq">Česta pitanja</a>
          <a href="/kontakt">Kontakt</a>
          <a href="/admin">Administracija</a>
        </div>
      </div>
    </footer>
  );
}
