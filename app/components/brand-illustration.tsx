import { glyphPaths } from "./brand-glyph";

/** Decorative editorial art built from the designer's own brand marks. */
export function BrandIllustration() {
  return <svg className="brand-illustration" viewBox="0 0 600 480" aria-hidden="true" focusable="false">
    <path fill="var(--blush)" d="M0 0h600v480H0z" />
    <circle cx="464" cy="110" r="54" fill="var(--surface)" />
    <path fill="var(--brand-light)" d="M0 310Q150 175 320 308T600 285V480H0Z" />
    <path fill="var(--brand)" d="M0 380Q170 460 310 343T600 330V480H0Z" />
    <path d={glyphPaths.bottle} fill="var(--surface)" transform="translate(197 70) scale(4.5) rotate(-8 32 32)" />
    <path d={glyphPaths.cow} fill="var(--navy)" transform="translate(48 226) scale(2.4) rotate(-12 32 32)" />
    <path d={glyphPaths.drop} fill="var(--navy)" transform="translate(440 305) scale(1.35) rotate(16 32 32)" />
  </svg>;
}
