"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useLocale } from "../lib/i18n/client";
import { languageTags, localeLabels, locales, localizedPath } from "../lib/i18n/routing";
import { translate } from "../lib/i18n/translate";
export function LanguageSwitcher() {
  const locale = useLocale();
  const path = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu.current?.open) {
        menu.current.open = false;
        menu.current.querySelector("summary")?.focus();
      }
    };
    const dismissOutside = (event: PointerEvent) => {
      if (menu.current && !menu.current.contains(event.target as Node)) {
        menu.current.open = false;
      }
    };
    document.addEventListener("keydown", dismiss);
    document.addEventListener("pointerdown", dismissOutside);
    return () => {
      document.removeEventListener("keydown", dismiss);
      document.removeEventListener("pointerdown", dismissOutside);
    };
  }, []);
  return <details ref={menu} className="language-switcher" data-no-translate onBlur={event => {
    // Safari blurs the summary with no focus target before clicking a link.
    // Keep the menu open for that click; outside pointer presses close it above.
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) event.currentTarget.open = false;
  }}>
    <summary aria-label={translate("Izaberi jezik", locale)}><span aria-hidden="true">◎</span> {({ "sr-latn": "SR", "sr-cyrl": "СР", en: "EN", ru: "РУ" })[locale]}</summary>
    <nav aria-label={translate("Jezik sajta", locale)}>
      {locales.map(item => <a key={item} href={localizedPath(path, item)} hrefLang={languageTags[item]} lang={languageTags[item]} aria-current={item === locale ? "true" : undefined} onClick={event => {
        // Full navigation updates the document language and keeps query/hash state.
        event.currentTarget.href = localizedPath(path, item) + window.location.search + window.location.hash;
      }}>{localeLabels[item]}</a>)}
    </nav>
  </details>;
}
