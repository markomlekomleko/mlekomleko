import { Fragment, type CSSProperties, type ReactNode } from "react";

type MarqueeVariant = "ticker" | "band";

export type MarqueeProps = {
  items: readonly string[];
  variant: MarqueeVariant;
  /** Drawn between items; defaults to a middle dot. Always decorative. */
  separator?: ReactNode;
  /** Copies of the item list inside one track, so a short list still fills a wide screen. */
  repeat?: number;
  /** Set it for an informational ticker: one still copy is then read out as "label: a · b". */
  label?: string;
  className?: string;
};

// Seconds per character of one track. The ticker scrolls about 150 characters in 40 s so
// small uppercase text stays readable; the band's display type is roughly five times
// wider per character, so it gets more time per character to move at a calmer pace.
const SECONDS_PER_CHAR: Record<MarqueeVariant, number> = { ticker: 40 / 150, band: 0.55 };
const MIN_SECONDS: Record<MarqueeVariant, number> = { ticker: 20, band: 24 };

/**
 * Endless horizontal strip. Two identical tracks sit side by side in a rail that moves by
 * exactly −50%, so the loop has no seam. The moving copies are hidden from assistive
 * technology; an informational ticker exposes one static copy instead.
 */
export function Marquee({ items, variant, separator, repeat = 3, label, className }: MarqueeProps) {
  const copies = Math.max(1, Math.floor(repeat));
  const sequence = Array.from({ length: copies }, () => items).flat();
  // Separators count as roughly three characters of travel each.
  const characters = sequence.reduce((sum, item) => sum + item.length + 3, 0);
  const seconds = Math.max(MIN_SECONDS[variant], Math.round(characters * SECONDS_PER_CHAR[variant]));
  const style = { "--marquee-duration": `${seconds}s` } as CSSProperties;
  const mark = separator ?? "·";
  const band = variant === "band";
  const classes = ["marquee", `marquee--${variant}`, className].filter(Boolean).join(" ");

  const track = (key: string) => (
    <ul className="marquee-track" key={key}>
      {sequence.map((item, index) => (
        <Fragment key={index}>
          <li className="marquee-item">{item}</li>
          <li className="marquee-sep">{mark}</li>
        </Fragment>
      ))}
    </ul>
  );

  return (
    <div className={classes} style={style} aria-hidden={band ? true : undefined}>
      {!band && label ? (
        <p className="marquee-sr">
          {label}: {items.join(" · ")}
        </p>
      ) : null}
      <div className="marquee-viewport" aria-hidden="true">
        <div className="marquee-rail">
          {track("a")}
          {track("b")}
        </div>
      </div>
    </div>
  );
}
