"use client";
import { createContext, useContext, type ReactNode } from "react";
import { defaultLocale, type Locale } from "./routing";
import { localizeTree } from "./render";
const LocaleContext = createContext<Locale>(defaultLocale);
export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}
export function useLocale() { return useContext(LocaleContext); }
export function useLocalize() {
  const locale = useLocale();
  return (node: ReactNode) => localizeTree(node, locale);
}
