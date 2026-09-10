"use client";

import { useEffect, useRef, useState } from "react";
import type { MilkSceneController } from "./milk-scene-renderer";

/** A Blender-rendered poster stays visible without JS, WebGL, or motion. */
export function MilkScene() {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<MilkSceneController | null>(null);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const desktop = matchMedia("(min-width: 761px)");
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    let disposed = false;
    let generation = 0;
    let timer = 0;
    const update = () => {
      const current = ++generation;
      window.clearTimeout(timer);
      controller.current?.destroy();
      controller.current = null;
      if (motion.matches || !desktop.matches || connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? "")) return;
      timer = window.setTimeout(() => {
        void import("./milk-scene-renderer").then(({ mountMilkScene }) => {
          if (disposed || generation !== current) return;
          controller.current = mountMilkScene(element, (value) => { if (!disposed) setReady(value); });
          setPaused(false);
        }).catch(() => { /* Keep the product poster if WebGL is unavailable. */ });
      }, 450);
    };
    update();
    motion.addEventListener("change", update); desktop.addEventListener("change", update);
    return () => {
      disposed = true; generation++; window.clearTimeout(timer);
      motion.removeEventListener("change", update); desktop.removeEventListener("change", update);
      controller.current?.destroy(); controller.current = null;
    };
  }, []);
  return (
    <>
      <div ref={host} className="milk-scene" role="img" aria-label="Kravlje i kozje mleko u povratnim staklenim flašama sa znakom Mleko i Mleko">
        <picture className="milk-scene-poster">
          <img src="/images/3d/milk-bottles.webp" alt="" width="1000" height="1100" fetchPriority="high" />
        </picture>
      </div>
      {ready ? <div className="scene-controls" role="group" aria-label="Prikaz flaša">
        <button type="button" aria-label="Okreni flaše ulevo" onClick={() => controller.current?.turn(-1)}>↶</button>
        <button type="button" aria-label={paused ? "Pokreni animaciju" : "Pauziraj animaciju"} aria-pressed={paused} onClick={() => { controller.current?.pause(!paused); setPaused(!paused); }}>{paused ? "▷" : "Ⅱ"}</button>
        <button type="button" aria-label="Okreni flaše udesno" onClick={() => controller.current?.turn(1)}>↷</button>
      </div> : null}
    </>
  );
}
