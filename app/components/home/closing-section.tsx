"use client";

import { useLocalize } from "@/app/lib/i18n/client";
import Image from "next/image";
import type { CSSProperties } from "react";
import { homeCopy } from "../../lib/content";
import type { StorefrontSettings } from "../../lib/frontend";
import { glyphPaths, type BrandGlyphName } from "../brand-glyph";

/** One stamp in the pattern tile: glyph, centre x, centre y, size and turn in degrees. */
type Stamp = readonly [name: BrandGlyphName, x: number, y: number, size: number, turn: number];

const TILE = 240;

// Roughly a 4 × 4 grid of 60px cells, jittered. Each row is the previous one shifted by
// a cell, so no two neighbours repeat a glyph even across the tile seams. Sizes and
// turns vary so it reads as hand-stamped rather than gridded.
const STAMPS: readonly Stamp[] = [
  ["cow", 28, 30, 54, -14],
  ["bottle", 92, 26, 54, 22],
  ["drop", 150, 33, 46, -26],
  ["bottle", 213, 29, 52, -30],
  ["bottle", 33, 92, 54, 28],
  ["drop", 94, 88, 46, 12],
  ["bottle", 152, 92, 52, -18],
  ["cow", 208, 89, 50, 20],
  ["drop", 27, 151, 46, -8],
  ["bottle", 88, 148, 54, -26],
  ["cow", 150, 152, 54, 10],
  ["bottle", 214, 149, 54, 24],
  ["bottle", 31, 212, 50, 16],
  ["cow", 92, 210, 50, -22],
  ["bottle", 150, 211, 54, 30],
  ["drop", 211, 213, 44, 24],
];

// A stamp that pokes over a tile edge is drawn again one tile over on the other side,
// so the repeat completes it instead of slicing it off. Glyph ink spans at most about
// 0.64 of its box from the centre at any turn.
function wrapOffsets(centre: number, size: number) {
  const reach = size * 0.64;
  return [0, ...(centre - reach < 0 ? [TILE] : []), ...(centre + reach > TILE ? [-TILE] : [])];
}

const glyphNames = Object.keys(glyphPaths) as BrandGlyphName[];

// Built once from the shared glyph paths, so the pattern can never drift from the logo
// marks. The section's CSS paints it over the teal ground through a custom property.
// Two-tone like the logo, whose goat is navy and cow white: cows white, the rest navy.
const patternSvg = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}" viewBox="0 0 ${TILE} ${TILE}" fill="#353a4a">`,
  `<defs>${glyphNames.map((name) => `<path id="${name}" d="${glyphPaths[name]}"/>`).join("")}</defs>`,
  ...STAMPS.flatMap(([name, x, y, size, turn]) =>
    wrapOffsets(x, size).flatMap((dx) =>
      wrapOffsets(y, size).map(
        (dy) =>
          `<use href="#${name}"${name === "cow" ? ' fill="#fff"' : ""} transform="translate(${x + dx - size / 2} ${y + dy - size / 2}) scale(${size / 64}) rotate(${turn} 32 32)"/>`,
      ),
    ),
  ),
  "</svg>",
].join("");

const patternStyle = {
  "--closing-pattern": `url("data:image/svg+xml,${encodeURIComponent(patternSvg)}")`,
} as CSSProperties;

export function ClosingSection({ settings }: { settings: Pick<StorefrontSettings, "guaranteeText"> }) {
  const localize = useLocalize();
  const copy = homeCopy.closing;

  return localize((
    <section className="closing" aria-labelledby="closing-title" style={patternStyle}>
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
