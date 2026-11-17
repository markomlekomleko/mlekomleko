"use client";

import { useLocalize } from "@/app/lib/i18n/client";
import { homeCopy } from "../lib/content";

type HeroCopyProps = {
  offerHref: string;
  /** Kept for the scroll scene's signature; the hero now offers a single action. */
  deliveryHref?: string;
  /** Kept for the scroll scene's signature; the hero no longer shows the rhythm sticker. */
  withRhythm?: boolean;
};

/**
 * The hero's words. The footage carries the story, so the only visible element is the
 * one action (meeting 17 Nov 2026: all hero copy removed, "Mleko koje znaš" button and the "Skroluj i otkrij" hint).
 * The h1 stays for assistive technology and search, visually hidden.
 */
export function HeroCopy({ offerHref }: HeroCopyProps) {
  const localize = useLocalize();
  const copy = homeCopy.hero;
  return localize((
    <div className="scene-copy">
      <div className="page-shell scene-copy-shell">
        <div className="scene-intro">
          <h1 id="hero-title" className="visually-hidden">{copy.title}</h1>
          <div className="scene-actions">
            <a className="button go hero-cta" href={offerHref}>
              {copy.primaryCta}
            </a>
          </div>
          <p className="hero-scroll-hint">{copy.hint}<span aria-hidden="true">↓</span></p>
        </div>
      </div>
    </div>
  ));
}
