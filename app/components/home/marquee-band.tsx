"use client";

/* eslint-disable @next/next/no-img-element -- Tiny decorative brand silhouettes. */
import { useLocalize } from "@/app/lib/i18n/client";
import { homeCopy } from "../../lib/content";
import { Marquee } from "../marquee";

/**
 * The tilted teal strip that overlaps the bottom edge of the hero. Purely decorative:
 * every word on it is said again in the sections below, so it is hidden from assistive
 * technology as a whole. The marks alternate goat and cow, like the logo.
 */
export function MarqueeBand() {
  const localize = useLocalize();
  return localize((
    <div className="home-band" aria-hidden="true">
      <Marquee
        variant="band"
        items={homeCopy.band}
        separator={(index) => (
          <img className="band-mark" src={index % 2 ? "/images/brand/cow-white.png" : "/images/brand/goat-navy.png"} alt="" width="56" height="42" />
        )}
      />
    </div>
  ));
}
