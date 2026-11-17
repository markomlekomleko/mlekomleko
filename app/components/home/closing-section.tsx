"use client";

import { useLocalize } from "@/app/lib/i18n/client";
import Image from "next/image";
import { homeCopy } from "../../lib/content";
import type { StorefrontSettings } from "../../lib/frontend";
export function ClosingSection({ settings }: { settings: Pick<StorefrontSettings, "guaranteeText"> }) {
  const localize = useLocalize();
  const copy = homeCopy.closing;

  return localize((
    <section className="closing pattern-ground" aria-labelledby="closing-title">
      <div className="page-shell">
        <div className="closing-card">
          {/* The logo slapped on the card's corner like a sticker; the heading names the
              brand already, so it is decorative. */}
          <Image
            className="closing-logo"
            src="/images/mleko-i-mleko-logo-mark.png"
            alt=""
            width={148}
            height={148}
            sizes="(min-width: 1234px) 148px, 12vw"
          />
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id="closing-title">{copy.title}</h2>
          <p className="closing-text">{settings.guaranteeText}</p>
          <a className="button closing-cta" href="#izaberite-mleko">
            {copy.cta}
          </a>
        </div>
      </div>
    </section>
  ));
}
