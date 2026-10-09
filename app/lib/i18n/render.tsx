import { Children, cloneElement, isValidElement, type ReactNode, type ReactElement } from "react";
import { languageTags, localizedPath, type Locale } from "./routing";
import { translate } from "./translate";
import { getSiteUrl } from "../seo";

/** Localize render output only. Form values, event handlers and commerce data stay intact. */
export function localizeTree(node: ReactNode, locale: Locale): ReactNode {
  if (locale === "sr-latn") return node;
  if (typeof node === "string") return translate(node, locale);
  if (Array.isArray(node)) return Children.map(node, child => localizeTree(child, locale));
  if (!isValidElement(node)) return node;
  const element = node as ReactElement<Record<string, unknown>>;
  const props = element.props;
  if (props["data-no-translate"] || element.type === "code" || element.type === "pre") return element;
  const changed: Record<string, unknown> = {};
  for (const key of ["aria-label", "aria-description", "alt", "title", "placeholder", "label"]) {
    if (typeof props[key] === "string") changed[key] = translate(props[key] as string, locale);
  }
  if (typeof props.href === "string") changed.href = localizedPath(props.href, locale);
  if (element.type === "script") {
    if (props.type === "application/ld+json" && props.dangerouslySetInnerHTML) {
      const html = (props.dangerouslySetInnerHTML as { __html: string }).__html;
      changed.dangerouslySetInnerHTML = { __html: JSON.stringify(localizeSchema(JSON.parse(html), locale)).replace(/</g, "\\u003c") };
    }
  } else if (props.children !== undefined) {
    // Native options with an implicit value must keep the original submitted value.
    if (element.type === "option" && props.value === undefined && typeof props.children === "string") changed.value = props.children;
    changed.children = localizeTree(props.children as ReactNode, locale);
  }
  return cloneElement(element, changed);
}
export function localizeSchema(value: unknown, locale: Locale, key = ""): unknown {
  if (Array.isArray(value)) return value.map(item => localizeSchema(item, locale, key));
  if (typeof value === "object" && value !== null) return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, localizeSchema(item, locale, name)]));
  if (typeof value !== "string") return value;
  if (["name", "text", "description", "headline"].includes(key)) return translate(value, locale);
  if (key === "inLanguage") return languageTags[locale];
  if (["url", "item", "@id"].includes(key) && value.startsWith("http") && !value.includes("#organization")) {
    const url = new URL(value);
    if (url.origin === getSiteUrl().origin) {
      url.pathname = localizedPath(url.pathname, locale); return url.toString();
    }
  }
  return value;
}
