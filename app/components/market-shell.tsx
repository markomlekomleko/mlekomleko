"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useCart } from "./cart-provider";
import { CookieSettingsButton } from "./analytics-provider";
import styles from "../market.module.css";

const navigation = [
  { label: "Kako dostavljamo", links: [["Kako funkcioniše", "/kako-funkcionise"], ["Dostava", "/dostava"], ["Česta pitanja", "/faq"]] },
  { label: "Mleko", links: [["Prodavnica", "/prodavnica"], ["Gde kupiti", "/gde-kupiti"]] },
  { label: "Naše poreklo", links: [["Naše farme", "/farme"], ["Kontakt", "/kontakt"]] },
];

export function MarketHeader({ storeName }: { storeName: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  const { count, ready, openDrawer, drawerOpen } = useCart();
  const visible = menuOpen && !drawerOpen;

  useEffect(() => {
    function dismiss(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const active = header.current?.querySelector<HTMLDetailsElement>("details[open]");
      active?.querySelector("summary")?.focus();
      header.current?.querySelectorAll("details").forEach((item) => { item.open = false; });
      if (menuOpen) { setMenuOpen(false); menuButton.current?.focus(); }
    }
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !header.current?.contains(event.target)) {
        setMenuOpen(false);
        header.current?.querySelectorAll("details").forEach((item) => { item.open = false; });
      }
    }
    window.addEventListener("keydown", dismiss);
    window.addEventListener("pointerdown", outside);
    return () => { window.removeEventListener("keydown", dismiss); window.removeEventListener("pointerdown", outside); };
  }, [menuOpen]);

  return (
    <header ref={header} className={styles.header} data-hero-header>
      <button ref={menuButton} className={styles.menuButton} aria-label="Meni" aria-expanded={visible} aria-controls="market-mobile-nav" onClick={() => setMenuOpen(!menuOpen)}>
        <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          {visible ? <path d="m6 6 20 20M26 6 6 26" /> : <path d="M3 7h26M3 16h26M3 25h26" />}
        </svg>
      </button>
      <Link className={styles.brand} href="/" aria-label={`${storeName} — početna`}>
        <Image className={styles.brandLogo} src="/images/mleko-i-mleko-logo-mark.png" alt="" width={128} height={128} sizes="64px" />
      </Link>
      <nav className={styles.navigation} aria-label="Glavna navigacija">
        {navigation.map((group) => <details className={styles.navGroup} name="market-navigation" key={group.label}>
          <summary>{group.label}<span className={styles.chevron} /></summary>
          <div className={styles.dropdown}>{group.links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}</div>
        </details>)}
      </nav>
      <Link className={styles.account} href="/nalog" aria-label="Moj nalog">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" /></svg>
        <span>Moj nalog</span>
      </Link>
      {ready && count > 0 ? <button className={`${styles.button} ${styles.headerButton}`} onClick={openDrawer}>Korpa ({count})</button> : <Link className={`${styles.button} ${styles.headerButton}`} href="/#izaberite-mleko">Izaberi mleko</Link>}
      {visible && <nav id="market-mobile-nav" className={styles.mobileNavigation} aria-label="Mobilna navigacija">
        {navigation.flatMap((group) => group.links).map(([label, href]) => <Link href={href} key={href} onClick={() => setMenuOpen(false)}>{label}</Link>)}
        <button onClick={() => { setMenuOpen(false); openDrawer(); }}>Korpa{ready && count > 0 ? ` (${count})` : ""}</button>
      </nav>}
    </header>
  );
}

export function MarketFooter({ storeName }: { storeName: string }) {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <Link href="/" className={styles.brand} aria-label={`${storeName} — početna`}>
          <Image className={styles.brandLogo} src="/images/mleko-i-mleko-logo-mark.png" alt="" width={208} height={208} sizes="104px" />
        </Link>
        <nav className={styles.footerNav} aria-label="Korisne informacije">
          {[["Prodavnica", "/prodavnica"], ["Naše farme", "/farme"], ["Gde kupiti", "/gde-kupiti"], ["Dostava Beograd", "/dostava-mleka/beograd"], ["Dostava Novi Sad", "/dostava-mleka/novi-sad"], ["Česta pitanja", "/faq"], ["Kontakt", "/kontakt"], ["Dostava", "/dostava"], ["Pravila pretplate", "/pravila-pretplate"]].map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>
        <div className={styles.socials}>
          <a href="https://instagram.com/mleko_i_mleko" target="_blank" rel="noreferrer" aria-label="Instagram"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><rect x="4" y="4" width="24" height="24" rx="7" /><circle cx="16" cy="16" r="6" /><circle cx="23" cy="9" r="1.5" fill="currentColor" stroke="none" /></svg></a>
          <a href="https://www.tiktok.com/@mleko_i_mleko" target="_blank" rel="noreferrer" aria-label="TikTok"><svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><path d="M19 3h4c0 4 2 6 6 7v4a13 13 0 0 1-6-2v10a9 9 0 1 1-9-9v4a5 5 0 1 0 5 5z" /></svg></a>
          <a href="tel:+381605022323">060 502 23 23</a>
        </div>
        <div className={styles.legal}>
          <Link href="/uslovi-kupovine">Uslovi kupovine</Link>
          <Link href="/privatnost">Privatnost i kolačići</Link>
          <Link href="/reklamacije">Reklamacije i povraćaj</Link>
          <CookieSettingsButton />
        </div>
      </div>
    </footer>
  );
}
