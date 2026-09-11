"use client";

import { useEffect, useRef, useState } from "react";
import type { HeroMedia, HeroVariant } from "../lib/hero-media";

type HeroSceneProps = {
  media: HeroMedia | null;
  offerHref: string;
  deliveryHref: string;
};

/** 0 below `from`, 1 above `to`, smoothly eased between. */
function ramp(value: number, from: number, to: number) {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

function setVar(element: HTMLElement, name: string, value: number) {
  element.style.setProperty(name, value.toFixed(4));
}

/**
 * Scroll-linked introduction.
 *
 * The scene is pinned with `position: sticky` so the browser keeps its own scrolling,
 * and a single requestAnimationFrame loop writes the smoothed progress onto CSS custom
 * properties and the video's `currentTime`. No React state is updated per frame.
 */
export function HeroScene({ media, offerHref, deliveryHref }: HeroSceneProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [variant, setVariant] = useState<"desktop" | "mobile" | null>(null);
  const [mode, setMode] = useState<"static" | "scroll">(media ? "scroll" : "static");
  const [videoReady, setVideoReady] = useState(false);
  const [showEndFrame, setShowEndFrame] = useState(false);

  const active: HeroVariant | null = media
    ? variant === "desktop"
      ? media.desktop
      : variant === "mobile"
        ? media.mobile
        : null
    : null;

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const wide = matchMedia("(min-width: 768px)");
    let frame = 0;
    let last = 0;
    let target = 0;
    let current = 0;
    let pinHeight = 0;
    let running = false;
    let visible = false;

    const applyEnvironment = () => {
      if (reduced.matches || !media) {
        setMode("static");
        setShowEndFrame(Boolean(media));
        setVariant(null);
        return;
      }
      setMode("scroll");
      setShowEndFrame(false);
      setVariant(wide.matches ? "desktop" : "mobile");
    };

    const measure = () => {
      pinHeight = pinRef.current?.offsetHeight ?? window.innerHeight;
    };

    const readProgress = () => {
      const track = trackRef.current;
      if (!track) return 0;
      const rect = track.getBoundingClientRect();
      const travel = rect.height - pinHeight;
      if (travel <= 0) return rect.top <= 0 ? 1 : 0;
      return Math.min(1, Math.max(0, -rect.top / travel));
    };

    const paint = (progress: number) => {
      setVar(section, "--hero-p", progress);
      const intro = 1 - ramp(progress, 0.14, 0.44);
      setVar(section, "--hero-intro-o", intro);
      setVar(section, "--hero-intro-y", (1 - intro) * -26);
      const rhythm = ramp(progress, 0.5, 0.62) * (1 - ramp(progress, 0.84, 0.96));
      setVar(section, "--hero-rhythm-o", rhythm);
      setVar(section, "--hero-rhythm-y", (1 - rhythm) * 18);
      setVar(section, "--hero-fold", ramp(progress, 0.8, 1));
      const video = videoRef.current;
      // Never queue a new seek while the decoder is still serving the previous one:
      // a backlog of stale positions is what makes scrubbing stutter on slow phones.
      if (video && !video.seeking && video.readyState >= 2 && Number.isFinite(video.duration)) {
        const time = progress * Math.max(0, video.duration - 0.05);
        if (Math.abs(video.currentTime - time) > 0.02) video.currentTime = time;
      }
    };

    const tick = (now: number) => {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016;
      last = now;
      // Time-based easing keeps the same feel on 60 Hz and 120 Hz screens.
      const tau = wide.matches ? 0.3 : 0.2;
      current += (target - current) * (1 - Math.exp(-dt / tau));
      paint(current);
      const settling = Math.abs(target - current) > 0.0004;
      // Keep the loop alive one more frame while a seek is still pending, so the
      // clip always lands on the position the reader stopped at.
      const catchingUp = videoRef.current?.seeking === true;
      if ((settling || catchingUp) && visible) {
        frame = requestAnimationFrame(tick);
      } else {
        current = target;
        paint(current);
        running = false;
        frame = 0;
      }
    };

    const request = () => {
      if (running || !visible) return;
      running = true;
      last = 0;
      frame = requestAnimationFrame(tick);
    };

    const onScroll = () => {
      target = readProgress();
      request();
    };

    const onResize = () => {
      measure();
      target = readProgress();
      current = target;
      paint(current);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) {
          measure();
          onScroll();
        } else if (frame) {
          cancelAnimationFrame(frame);
          frame = 0;
          running = false;
          // Park the scene on the frame the reader left it on.
          paint(target);
        }
      },
      { rootMargin: "120px 0px" },
    );

    applyEnvironment();
    measure();
    target = readProgress();
    current = target;
    paint(current);
    observer.observe(section);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    reduced.addEventListener("change", applyEnvironment);
    wide.addEventListener("change", applyEnvironment);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      reduced.removeEventListener("change", applyEnvironment);
      wide.removeEventListener("change", applyEnvironment);
    };
  }, [media]);

  const poster = media
    ? showEndFrame && media.desktop.endFrame && media.mobile.endFrame
      ? { desktop: media.desktop.endFrame, mobile: media.mobile.endFrame }
      : { desktop: media.desktop.poster, mobile: media.mobile.poster }
    : null;

  return (
    <section
      ref={sectionRef}
      className="hero"
      data-mode={mode}
      data-video={videoReady ? "ready" : "poster"}
      aria-labelledby="hero-title"
    >
      <div ref={trackRef} className="scene-track">
        <div ref={pinRef} className="scene-pin">
          <div className="scene-stage">
            <div className="scene-frame">
              {poster ? (
                <picture className="scene-poster">
                  <source media="(min-width: 768px)" srcSet={poster.desktop} />
                  <img
                    src={poster.mobile}
                    alt={media?.desktop.alt ?? ""}
                    width={1080}
                    height={1920}
                    fetchPriority="high"
                  />
                </picture>
              ) : (
                <picture className="scene-poster">
                  <source srcSet="/images/3d/milk-bottles.webp" type="image/webp" />
                  <img
                    src="/images/3d/milk-bottles.png"
                    alt="Kravlje i kozje mleko u povratnim staklenim flašama Mleko i Mleko"
                    width={1000}
                    height={1100}
                    fetchPriority="high"
                  />
                </picture>
              )}
              {active?.video && mode === "scroll" ? (
                <video
                  ref={videoRef}
                  className="scene-video"
                  src={active.video}
                  width={active.width}
                  height={active.height}
                  muted
                  playsInline
                  preload="auto"
                  aria-hidden="true"
                  tabIndex={-1}
                  onLoadedData={() => setVideoReady(true)}
                  onError={() => {
                    setVideoReady(false);
                    setMode("static");
                    setShowEndFrame(true);
                  }}
                />
              ) : null}
            </div>
          </div>

          <div className="scene-copy">
            <div className="page-shell scene-copy-shell">
              <div className="scene-intro">
                <p className="eyebrow">Domaće mleko na kućnu adresu</p>
                <h1 id="hero-title">Jutro počinje ovde.</h1>
                <p className="scene-lead">
                  Kravlje i kozje mleko u povratnim staklenim flašama.
                </p>
                <div className="scene-actions">
                  <a className="button" href={offerHref}>
                    Izaberi svoje mleko
                  </a>
                  <a className="scene-secondary" href={deliveryHref}>
                    Proveri dostavu
                  </a>
                </div>
                <p className="scene-hint" aria-hidden="true">
                  Skroluj i otkrij
                </p>
              </div>
              <p className="scene-rhythm" aria-hidden="true">
                <strong>Tvoje mleko. Tvoj ritam.</strong>
                <span>Kravlje · Kozje</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
