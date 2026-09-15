"use client";

import { useEffect, useRef, useState } from "react";
import type { HeroMedia, HeroVariant } from "../lib/hero-media";
import { createHeroPlayback } from "../lib/hero-playback";

type HeroSceneProps = {
  media: HeroMedia | null;
  offerHref: string;
};

/** Two deliberate gestures, with timed playback rather than scroll scrubbing. */
export function HeroScene({ media, offerHref }: HeroSceneProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [variant, setVariant] = useState<"desktop" | "mobile" | null>(null);
  const [mode, setMode] = useState<"static" | "scroll">(media ? "scroll" : "static");
  const [videoReady, setVideoReady] = useState(false);
  const [showEndFrame, setShowEndFrame] = useState(false);
  const onVideoLoadedRef = useRef<() => void>(() => {});
  const onVideoErrorRef = useRef<() => void>(() => {});

  const active: HeroVariant | null = media
    ? variant === "desktop"
      ? media.desktop
      : variant === "mobile"
        ? media.mobile
        : null
    : null;

  useEffect(() => {
    const section = sectionRef.current;
    const track = trackRef.current;
    const pin = pinRef.current;
    if (!section || !track || !pin) return;

    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const wide = matchMedia("(min-width: 768px)");
    const header = document.querySelector<HTMLElement>("[data-hero-header], .site-header-stack");
    let enabled = Boolean(media) && !reduced.matches;
    let step: 0 | 1 | 2 = 0;
    let headerHeight = 0;
    let origin = 0;
    let travel = 0;
    let scrollFrame = 0;
    let transitionUntil = 0;
    let lastWheel = -Infinity;
    let wheelDistance = 0;
    let touchY = 0;
    let touchX = 0;
    let touchConsumed = false;

    const measure = () => {
      headerHeight = header?.getBoundingClientRect().height ?? 0;
      section.style.setProperty("--hero-header-height", `${headerHeight}px`);
      origin = window.scrollY + track.getBoundingClientRect().top - headerHeight;
      travel = Math.max(0, track.offsetHeight - pin.offsetHeight);
    };

    const playback = createHeroPlayback({
      video: () => videoRef.current,
      duration: () => (wide.matches ? media?.desktop.durationSeconds : media?.mobile.durationSeconds) ?? 8.04,
      onReady: () => setVideoReady(true),
    });
    const cancelScroll = () => {
      cancelAnimationFrame(scrollFrame);
      scrollFrame = 0;
    };

    const setStep = (next: 0 | 1 | 2) => {
      step = next;
      section.dataset.step = String(next);
      section.style.setProperty("--hero-p", String(next === 0 ? 0 : next === 1 ? 0.65 : 1));
      section.style.setProperty("--hero-intro-o", next === 0 ? "1" : "0");
      section.style.setProperty("--hero-rhythm-o", next === 1 ? "1" : "0");
      const intro = section.querySelector<HTMLElement>(".scene-intro");
      if (intro) intro.inert = next !== 0;
      section.querySelector(".scene-rhythm")?.setAttribute("aria-hidden", String(next !== 1));
    };

    const moveToStep = (next: 0 | 1 | 2) => {
      cancelScroll();
      measure();
      setStep(next);
      playback.move(step, true);
      const from = window.scrollY;
      const to = Math.max(0, origin + (next === 0 ? 0 : next === 1 ? travel : track.offsetHeight));
      const duration = next === 2 ? 850 : 650;
      const started = performance.now();
      transitionUntil = started + duration;
      const tick = (now: number) => {
        const t = Math.min(1, (now - started) / duration);
        const eased = t * t * (3 - 2 * t);
        window.scrollTo({ top: from + (to - from) * eased, behavior: "instant" });
        if (t < 1) scrollFrame = requestAnimationFrame(tick);
        else scrollFrame = 0;
      };
      scrollFrame = requestAnimationFrame(tick);
    };

    const canHandle = (target: EventTarget | null) => {
      if (!enabled || !section.contains(target as Node)) return false;
      if (target instanceof Element && target.closest("input, select, textarea, [contenteditable=true]")) return false;
      const rect = pin.getBoundingClientRect();
      return rect.bottom > headerHeight + pin.offsetHeight * 0.5 && rect.top <= headerHeight + 2;
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || !canHandle(event.target)) return;
      const now = performance.now();
      const freshGesture = now - lastWheel > 180;
      lastWheel = now;
      if (step === 2 && !scrollFrame) return;
      if (step === 0 && event.deltaY < 0 && !scrollFrame) return;
      if (!event.cancelable) return;
      event.preventDefault();
      if (now < transitionUntil || (!freshGesture && wheelDistance === 0)) return;
      if (freshGesture) wheelDistance = 0;
      wheelDistance += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? pin.offsetHeight : 1);
      if (Math.abs(wheelDistance) < 12) return;
      const direction = Math.sign(wheelDistance);
      wheelDistance = 0;
      moveToStep(direction > 0 ? (step === 0 ? 1 : 2) : 0);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      touchY = event.touches[0].clientY;
      touchX = event.touches[0].clientX;
      touchConsumed = false;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1 || !canHandle(event.target)) return;
      const dy = touchY - event.touches[0].clientY;
      const dx = touchX - event.touches[0].clientX;
      if (Math.abs(dx) > Math.abs(dy) || (step === 2 && !scrollFrame) || (step === 0 && dy < 0 && !scrollFrame)) return;
      if (!event.cancelable) return;
      event.preventDefault();
      if (touchConsumed || performance.now() < transitionUntil || Math.abs(dy) < 24) return;
      touchConsumed = true;
      moveToStep(dy > 0 ? (step === 0 ? 1 : 2) : 0);
    };
    const onTouchEnd = (event: TouchEvent) => {
      // Safari can require playback directly from touchend, not touchmove or a
      // later metadata callback. Retry the same segment, without skipping a step.
      playback.retry();
      if (touchConsumed && event.cancelable) event.preventDefault();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Tab" || event.key === "End" || event.key === "Home" || event.key === "Escape") {
        cancelScroll();
        return;
      }
      const target = event.target;
      if (!enabled || event.ctrlKey || event.metaKey || event.altKey ||
          (target instanceof Element && target.closest("a, button, input, select, textarea, [contenteditable=true], [role=dialog]"))) return;
      const direction = event.key === "ArrowDown" || event.key === "PageDown" || (event.key === " " && !event.shiftKey) ? 1
        : event.key === "ArrowUp" || event.key === "PageUp" || (event.key === " " && event.shiftKey) ? -1 : 0;
      if (!direction || !canHandle(section) || (step === 2 && !scrollFrame) || (step === 0 && direction < 0)) return;
      event.preventDefault();
      if (event.repeat || performance.now() < transitionUntil) return;
      moveToStep(direction > 0 ? (step === 0 ? 1 : 2) : 0);
    };

    // Scrollbar dragging, anchor links and browser scroll restoration retain native
    // navigation. Re-entering from below restores the second scene without a trap.
    const onScroll = () => {
      if (!enabled || scrollFrame) return;
      const offset = window.scrollY - origin;
      const next = offset <= 8 ? 0 : offset > travel + pin.offsetHeight * 0.35 ? 2 : 1;
      if (next !== step) { setStep(next); playback.move(step, next > 0); }
    };
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest("a[href]")) cancelScroll();
    };
    // Mobile browser toolbars resize the viewport during a swipe. Re-measure
    // without cancelling the gesture animation or resetting its playback step.
    const onResize = () => { measure(); onScroll(); };
    const applyEnvironment = () => {
      cancelScroll();
      playback.stop();
      enabled = Boolean(media) && !reduced.matches;
      setMode(enabled ? "scroll" : "static");
      setShowEndFrame(!enabled && Boolean(media));
      const selected = wide.matches ? media?.desktop : media?.mobile;
      const video = videoRef.current;
      setVideoReady(Boolean(enabled && video && video.readyState >= 2 && video.getAttribute("src") === selected?.video));
      setVariant(enabled ? (wide.matches ? "desktop" : "mobile") : null);
      if (!enabled) setStep(0);
      measure();
    };
    onVideoLoadedRef.current = () => { measure(); onScroll(); playback.ready(); };
    onVideoErrorRef.current = () => {
      enabled = false;
      cancelScroll();
      playback.stop();
      setStep(0);
    };

    applyEnvironment();
    const resizeObserver = new ResizeObserver(onResize);
    if (header) resizeObserver.observe(header);
    resizeObserver.observe(pin);
    section.addEventListener("wheel", onWheel, { passive: false });
    section.addEventListener("touchstart", onTouchStart, { passive: true });
    section.addEventListener("touchmove", onTouchMove, { passive: false });
    section.addEventListener("touchend", onTouchEnd, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("click", onClick);
    reduced.addEventListener("change", applyEnvironment);
    wide.addEventListener("change", applyEnvironment);

    return () => {
      cancelScroll();
      playback.dispose();
      resizeObserver.disconnect();
      onVideoLoadedRef.current = () => {};
      onVideoErrorRef.current = () => {};
      section.removeEventListener("wheel", onWheel);
      section.removeEventListener("touchstart", onTouchStart);
      section.removeEventListener("touchmove", onTouchMove);
      section.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("click", onClick);
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
                  key={active.video}
                  ref={videoRef}
                  className="scene-video"
                  src={active.video}
                  poster={active.poster}
                  width={active.width}
                  height={active.height}
                  muted
                  playsInline
                  preload="auto"
                  aria-hidden="true"
                  tabIndex={-1}
                  onLoadedMetadata={() => onVideoLoadedRef.current()}
                  onLoadedData={() => onVideoLoadedRef.current()}
                  onCanPlay={() => onVideoLoadedRef.current()}
                  onPlaying={() => setVideoReady(true)}
                  onError={() => {
                    onVideoErrorRef.current();
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
