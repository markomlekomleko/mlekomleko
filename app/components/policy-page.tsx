import Link from "next/link";
import { glyphPaths, type BrandGlyphName } from "./brand-glyph";

export type PolicySection = { title: string; paragraphs: string[] };

const stampRing: readonly BrandGlyphName[] = ["bottle", "drop", "cow"];

/**
 * The house stamp beside a text-only page title: the home offer stamp with a ring of the
 * three brand glyphs in place of its words, so content pages add no copy of their own.
 * Purely decorative, hidden from assistive technology; content.css shows it from 1024px.
 */
export function ContentStamp({ glyph = "cow" }: { glyph?: BrandGlyphName }) {
  return (
    <svg className="content-stamp" viewBox="0 0 160 160" aria-hidden="true" focusable="false">
      <circle className="content-stamp-disc" cx="80" cy="80" r="78" />
      <circle className="content-stamp-inner" cx="80" cy="80" r="44" />
      <g className="content-stamp-spin">
        {/* Twelve 16px glyphs, each drawn at the top of the ring and turned into place. */}
        {Array.from({ length: 12 }, (_, index) => (
          <path key={index} d={glyphPaths[stampRing[index % stampRing.length]]} transform={`rotate(${index * 30} 80 80) translate(72 12) scale(0.25)`} />
        ))}
      </g>
      <path d={glyphPaths[glyph]} transform="translate(56 56) scale(0.75)" />
    </svg>
  );
}

export function PolicyPage({ eyebrow, title, intro, sections }: { eyebrow: string; title: string; intro: string; sections: PolicySection[] }) {
  return (
    <div className="content-page policy-page">
      <header className="content-band content-hero">
        <div className="page-shell content-head">
          <div className="page-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="lead">{intro}</p><p className="policy-updated">Poslednje ažuriranje: 4. septembar 2026.</p></div>
          <ContentStamp glyph="bottle" />
        </div>
      </header>
      <div className="content-band">
        <div className="page-shell">
          <div className="policy-list">
            {sections.map((section) => <section className="policy-row" key={section.title}><h2>{section.title}</h2><div className="policy-text">{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div></section>)}
          </div>
          <p className="policy-contact">Pitanje ili zahtev? <Link href="/kontakt">Javi nam se</Link>.</p>
        </div>
      </div>
    </div>
  );
}
