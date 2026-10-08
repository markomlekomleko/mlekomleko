import { homeCopy } from "../../lib/content";
import { BrandGlyph } from "../brand-glyph";
import { Marquee } from "../marquee";

/**
 * The tilted orange strip that overlaps the bottom edge of the hero. Purely decorative:
 * every word on it is said again in the sections below, so it is hidden from assistive
 * technology as a whole.
 */
export function MarqueeBand() {
  return (
    <div className="home-band" aria-hidden="true">
      <Marquee variant="band" items={homeCopy.band} separator={<BrandGlyph name="bottle" />} />
    </div>
  );
}
