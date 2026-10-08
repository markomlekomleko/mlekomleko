import type { ComponentProps } from "react";
import { HeroLoop } from "./hero-loop";
import { HeroScene } from "./hero-scene";

/**
 * The home hero. The media manifest's `kind` picks the component: an ambient loop for
 * the client's own footage, otherwise the scroll scene (which also covers "no media").
 * Choosing here keeps app/page.tsx unchanged whichever clip is live.
 */
export function Hero(props: ComponentProps<typeof HeroScene>) {
  const { media } = props;
  if (media?.kind === "loop") return <HeroLoop {...props} media={media} />;
  return <HeroScene {...props} />;
}
