"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { HeroMedia, HeroVariant } from "../lib/hero-media";
import { HeroCopy } from "./hero-copy";

type HeroLoopProps = {
  media: HeroMedia;
  offerHref: string;
  deliveryHref: string;
};

/**
 * Live answer to a media query. The server snapshot is null, so hydration renders
 * exactly what the server sent and the real answer arrives in the next render.
 */
function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (notify: () => void) => {
      const list = matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    [query],
  );
  const read = useCallback(() => matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, read, () => null);
}

/**
 * Ambient hero: a muted clip that plays by itself in a shorter, unpinned hero. It only
 * runs while it is on screen and the tab is visible, and the reader can stop it
 * (WCAG 2.2.2). Reduced motion or a clip that fails to load leaves the still frame and
 * never mounts a <video>, so nothing is downloaded for it.
 */
export function HeroLoop({ media, offerHref, deliveryHref }: HeroLoopProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const wide = useMediaQuery("(min-width: 768px)");
  const [failed, setFailed] = useState(false);
  const [readySrc, setReadySrc] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);

  const still = reduced === true || failed;
  const variant = wide === null ? null : wide ? media.desktop : media.mobile;
  const src = still ? null : (variant?.video ?? null);
  const mode = still || (variant && !variant.video) ? "static" : "loop";
  const frame = (item: HeroVariant) => (still && item.endFrame) || item.poster;

  useEffect(() => {
    const section = sectionRef.current;
    const video = videoRef.current;
    if (!section || !video) return;
    let onScreen = true;
    const sync = () => {
      if (paused || !onScreen || document.hidden) video.pause();
      // play() rejects when a pause() overtakes it; the next sync settles the state.
      else video.play().catch(() => {});
    };
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      sync();
    });
    observer.observe(section);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [paused, src]);

  return (
    <section
      ref={sectionRef}
      className="hero"
      data-mode={mode}
      data-video={src && readySrc === src ? "ready" : "poster"}
      data-kind="loop"
      data-tone={media.tone}
      aria-labelledby="hero-title"
    >
      <div className="scene-track">
        <div className="scene-pin">
          <div className="scene-stage">
            <div className="scene-frame">
              <picture className="scene-poster">
                <source media="(min-width: 768px)" srcSet={frame(media.desktop)} />
                <img
                  src={frame(media.mobile)}
                  alt={media.desktop.alt}
                  width={media.mobile.width}
                  height={media.mobile.height}
                  fetchPriority="high"
                />
              </picture>
              {src && variant ? (
                <video
                  key={src}
                  ref={videoRef}
                  className="scene-video"
                  src={src}
                  poster={variant.poster}
                  width={variant.width}
                  height={variant.height}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  aria-hidden="true"
                  tabIndex={-1}
                  onLoadedData={() => setReadySrc(src)}
                  onError={() => setFailed(true)}
                />
              ) : null}
            </div>
          </div>
          <HeroCopy offerHref={offerHref} deliveryHref={deliveryHref} withRhythm={false} />
          {src ? (
            <button
              type="button"
              className="hero-loop-toggle"
              aria-pressed={paused}
              aria-label={paused ? "Pusti video" : "Zaustavi video"}
              onClick={() => setPaused((value) => !value)}
            >
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
                {paused ? <path d="M4 2.5v11L13.5 8z" /> : <path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z" />}
              </svg>
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
