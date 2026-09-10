"use client";

import { useEffect, useRef } from "react";

/** The product still remains useful without JS, WebGL or motion. */
export function MilkScene() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (motion.matches || connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? "")) return;
    let disposed = false;
    let destroy: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      void import("./milk-scene-renderer").then(({ mountMilkScene }) => {
        if (!disposed) destroy = mountMilkScene(element);
      }).catch(() => { /* Keep the product image when enhancement is unavailable. */ });
    }, 700);
    return () => { disposed = true; window.clearTimeout(timer); destroy?.(); };
  }, []);
  return (
    <div ref={host} className="milk-scene" role="img" aria-label="Domaće mleko u staklenoj ambalaži">
      <picture className="milk-scene-poster">
        <source srcSet="/images/demo/kravlje-mleko.avif" type="image/avif" />
        <img src="/images/demo/kravlje-mleko.webp" alt="" width="1000" height="1000" />
      </picture>
    </div>
  );
}
