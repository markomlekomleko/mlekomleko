export type BrandGlyphName = "bottle" | "drop" | "cow";

/**
 * Raw path data per glyph on a 64 × 64 grid, drawn slightly off-true to match the
 * hand-printed logo. Each value is one `d` string: outlines run clockwise and the
 * knocked-out details (bottle label, drop highlight, cow eyes and nostrils) run
 * counter-clockwise, so the default nonzero fill rule cuts them out without a
 * `fill-rule` — a CSS data-URI pattern can use the strings as they are.
 */
export const glyphPaths: Readonly<Record<BrandGlyphName, string>> = {
  bottle: [
    // Cap.
    "M21.9 4.6C21.8 3.3 22.6 2.6 23.9 2.6L40.2 2.4C41.5 2.4 42.2 3.1 42.2 4.4L42.4 9.6C42.4 10.9 41.7 11.6 40.4 11.6L23.8 11.9C22.5 11.9 21.8 11.2 21.8 9.9Z",
    // Neck, shoulders and body.
    "M24.4 14.3L39.8 14.1C40.8 14.1 41.4 14.7 41.4 15.7L41.5 19.4C41.6 21.6 43 23.2 45.3 24.9C49.3 27.9 51 31.4 51 36.2L51.3 56.4C51.4 59.8 49.6 61.6 46.2 61.6L17.9 61.9C14.5 61.9 12.7 60.1 12.8 56.7L13.1 36.4C13.2 31.6 15 28.2 18.9 25.2C21.2 23.4 22.6 21.8 22.7 19.6L22.8 15.9C22.8 14.9 23.4 14.3 24.4 14.3Z",
    // Label, knocked out.
    "M19.4 39.6L19.2 50.2L44.9 49.8L44.7 39.2Z",
  ].join(""),
  drop: [
    "M32.6 3.8C35.2 9.4 40.4 15.8 45.2 22.6C49.6 28.8 52.2 34 52 40.6C51.7 52.4 42.9 60.6 31.6 60.4C20.4 60.2 11.9 51.6 12.2 40.2C12.4 33.6 15.2 28.6 19.6 22.4C24.4 15.6 29.2 9.6 31.2 3.9C31.5 3.2 32.3 3.2 32.6 3.8Z",
    // Highlight, knocked out.
    "M20.5 40.5C20.2 45.6 22.6 49.8 26.8 51.6C27.9 52.1 28.6 51.2 27.9 50.3C25.3 47.4 24 44.3 23.9 40.4C23.9 39.3 23.1 38.8 22.2 38.9C21.3 39 20.6 39.6 20.5 40.5Z",
  ].join(""),
  cow: [
    // Horns, ears, head and muzzle in one outline.
    "M8.2 5.6C9.6 10.6 13.4 14.2 19.6 15.4C27.4 13.6 36.8 13.5 44.6 15.2C50.6 14 54.4 10.4 55.9 5.5C56.8 6.2 57.2 7.4 57 9C56.3 15.2 52.6 19.2 46.6 20.4C50.8 19.4 56.6 19.6 59.6 21.6C61 22.6 60.6 24.6 59.2 25.4C55.8 27.4 51.2 28.6 46.8 28.4C47.6 31.8 47.8 35.4 47.8 38.8C51.2 41.2 52.8 44.6 52.6 48.8C52.2 56.4 43.6 61.4 32.2 61.4C20.6 61.6 11.6 56.6 11.6 49C11.6 44.8 13.2 41.4 16.4 39C16.4 35.4 16.6 31.8 17.4 28.6C12.8 28.8 8.2 27.4 4.8 25.4C3.2 24.6 3 22.6 4.4 21.6C7.4 19.6 13.2 19.4 17.4 20.6C11.4 19.4 7.6 15.4 7 9.2C6.9 7.6 7.4 6.2 8.2 5.6Z",
    // Eyes, knocked out.
    "M21.2 30.4A2.9 3.3 0 1 0 27 30.4A2.9 3.3 0 1 0 21.2 30.4Z",
    "M37.1 30A2.9 3.3 0 1 0 42.9 30A2.9 3.3 0 1 0 37.1 30Z",
    // Nostrils, knocked out.
    "M23.18 50.62A2.4 3.2 -15 1 0 27.82 49.38A2.4 3.2 -15 1 0 23.18 50.62Z",
    "M36.18 49.38A2.4 3.2 15 1 0 40.82 50.62A2.4 3.2 15 1 0 36.18 49.38Z",
  ].join(""),
};

export type BrandGlyphProps = {
  name: BrandGlyphName;
  className?: string;
  /** Gives the glyph an accessible name; without it the glyph is decorative and hidden. */
  title?: string;
};

/** Hand-stamped brand mark — milk bottle, milk drop or cow head — in the current colour. */
export function BrandGlyph({ name, className, title }: BrandGlyphProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="currentColor"
      focusable="false"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <path d={glyphPaths[name]} />
    </svg>
  );
}
