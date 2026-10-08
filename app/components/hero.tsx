import type { ComponentProps } from "react";
import { HeroScene } from "./hero-scene";

/**
 * The home hero. It takes HeroScene's props and renders the scroll scene; choosing a
 * hero by the media manifest's `kind` belongs here, so app/page.tsx stays unchanged.
 */
export function Hero(props: ComponentProps<typeof HeroScene>) {
  return <HeroScene {...props} />;
}
