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
    <div className="site-header-stack" data-hero-header>
      {settings.announcementEnabled && announcementText.trim() ? <aside className="announcement-bar" aria-label="Obaveštenje">
        {announcementUrl ? <a href={announcementUrl} target={externalAnnouncement ? "_blank" : undefined} rel={externalAnnouncement ? "noopener noreferrer" : undefined}>{announcementText}</a> : <p>{announcementText}</p>}
      </aside> : null}
      <header className="site-header">
        <div className="nav-shell">
          <button ref={menuButton} id="menu-toggle" className="mobile-menu-button" type="button" aria-label="Meni" aria-expanded={menuVisible} aria-controls="glavna-navigacija" onClick={() => setMenuOpen((current) => !current)}>
            <span className={`menu-lines ${menuVisible ? "is-open" : ""}`} aria-hidden="true"><span /><span /></span>
          </button>
          {/* Every link closes the menu: a same-page hash link (the milk picker on the
              home page) would otherwise leave it covering the section. */}
          <nav id="glavna-navigacija" className={`main-nav ${menuVisible ? "is-open" : ""}`} aria-label="Glavna navigacija">
            <Link onClick={closeMenu} href="/#izaberite-mleko">Izaberi svoje mleko</Link>
            <Link onClick={closeMenu} href="/kako-funkcionise">Mesečna pretplata</Link>
            <Link onClick={closeMenu} href="/farme">Poreklo tvog mleka</Link>
            <Link onClick={closeMenu} href="/gde-kupiti">Mlekomati</Link>
            <Link onClick={closeMenu} className="nav-support" href="/faq">Česta pitanja</Link>
            <Link onClick={closeMenu} href="/kontakt">Kontakt</Link>
            <Link onClick={closeMenu} className="mobile-account" href="/nalog">Moj nalog</Link>
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

export function SiteFooter({ storeName = "Mleko i Mleko" }: { storeName?: string }) {
  const localize = useLocalize();
  const locale = useLocale();
  const legal = companyLine();
  // The Kafeterija footer in our colours (17 Nov 2026): logo and link columns, the legal
  // line with the registered company, a row of policies, how to pay, social links, and
  // the oversized faded wordmark running off the bottom.
  return localize((
    <footer className="site-footer site-footer--k">
      <div className="page-shell footer-k-grid">
        <div className="footer-brand-col">
          <Link className="brand footer-brand" href="/" aria-label={`${storeName} - početna`}>
            <Image className="brand-logo brand-logo-footer" src="/images/mleko-i-mleko-logo-mark.png" alt="" width={140} height={140} sizes="96px" />
          </Link>
          <p className="footer-tagline">{shellCopy.footer.tagline}</p>
        </div>
        <nav className="footer-links" aria-labelledby="footer-mleko">
          <h2 id="footer-mleko">Mleko</h2>
          <Link href="/#izaberite-mleko">Izaberi svoje mleko</Link>
          <Link href="/kako-funkcionise">Mesečna pretplata</Link>
          <Link href="/farme">Poreklo tvog mleka</Link>
          <Link href="/gde-kupiti">Mlekomati</Link>
        </nav>
        <nav className="footer-links" aria-labelledby="footer-pomoc">
          <h2 id="footer-pomoc">Pomoć</h2>
          <Link href="/faq">Česta pitanja</Link>
          <Link href="/kontakt">Kontakt</Link>
          <Link href="/nalog">Moj nalog</Link>
          <Link href="/gde-kupiti#partnerstvo">Postani partner</Link>
        </nav>
        <div className="footer-links footer-contact-col">
          <h2>Kontakt</h2>
          <a className="footer-contact" href={company.phoneHref}><FooterIcon name="phone" />{company.phone}</a>
          {company.email ? <a className="footer-contact" href={`mailto:${company.email}`}><FooterIcon name="mail" /><span data-no-translate>{company.email}</span></a> : null}
          <a className="footer-contact" href={INSTAGRAM_URL} target="_blank" rel="noreferrer"><FooterIcon name="instagram" />Instagram</a>
          <a className="footer-contact" href={TIKTOK_URL} target="_blank" rel="noreferrer"><FooterIcon name="tiktok" />TikTok</a>
        </div>
      </div>
      <div className="page-shell footer-k-legal">
        <p className="footer-company">
          {company.legalName ? <span data-no-translate>{company.legalName}</span> : null}
          {legal.map((part) => <span key={part}> · {part}</span>)}
        </p>
        <nav className="footer-policies" aria-label={shellCopy.footer.infoTitle}>
          <Link href="/uslovi-kupovine">Uslovi kupovine</Link>
          <Link href="/pravila-pretplate">Pravila pretplate</Link>
          <Link href="/dostava">Dostava</Link>
          <Link href="/reklamacije">Reklamacije i povraćaj</Link>
          <Link href="/privatnost">Privatnost i kolačići</Link>
          <CookieSettingsButton />
        </nav>
        <p className="footer-pay">Plaćanje gotovinom pri dostavi · u mlekomatu gotovinom ili karticom</p>
      </div>
      {/* Decorative: the brand name is already the logo link's accessible name. */}
      <div className="footer-bottom">
        <div className="page-shell footer-wordmark-wrap">
          {/* Drawn from a pseudo-element: purely decorative low-contrast type that contrast
              checkers would otherwise read as text. */}
          <p className="footer-wordmark" aria-hidden="true" data-wordmark={translate(shellCopy.footer.wordmark, locale)} />
        </div>
      </div>
    </footer>
  ));
}
