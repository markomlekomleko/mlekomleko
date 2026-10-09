"use client";

import { useLocalize } from "@/app/lib/i18n/client";
import { homeCopy } from "../../lib/content";
import { BrandGlyph } from "../brand-glyph";
import { Marquee } from "../marquee";

/**
 * The tilted teal strip that overlaps the bottom edge of the hero. Purely decorative:
 * every word on it is said again in the sections below, so it is hidden from assistive
 * technology as a whole.
 */
export function MarqueeBand() {
  const localize = useLocalize();
  return localize((
    <div className="home-band" aria-hidden="true">
      <Marquee variant="band" items={homeCopy.band} separator={<BrandGlyph name="cow" />} />
    </div>
  ));
}
