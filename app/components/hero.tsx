"use client";

import { useLocalize } from "@/app/lib/i18n/client";
import type { ComponentProps } from "react";
import { HeroLoop } from "./hero-loop";
import { HeroScene } from "./hero-scene";

/**
 * The home hero. The media manifest's `kind` picks the component: an ambient loop for
 * the client's own footage, otherwise the scroll scene (which also covers "no media").
 * Choosing here keeps app/page.tsx unchanged whichever clip is live.
 */
export function Hero(props: ComponentProps<typeof HeroScene>) {
  const localize = useLocalize();
  const { media } = props;
  if (media?.kind === "loop") return localize(<HeroLoop {...props} media={media} deliveryHref="/dostava-mleka/beograd" />);
  return localize(<HeroScene {...props} />);
}
