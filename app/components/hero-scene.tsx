"use client";

import { useEffect, useRef, useState } from "react";
import type { HeroMedia, HeroVariant } from "../lib/hero-media";

type HeroSceneProps = {
  media: HeroMedia | null;
  offerHref: string;
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
 * and a single requestAnimationFrame loop writes the scroll progress onto CSS custom
 * properties and drives the clip. No React state is updated per frame.
 *
 * The scene sits exactly on the scroll position, with no easing between the two.
 * An ease here reads as the hero trailing the reader's finger and only catching up
 * once they stop. The clip can only ever show whole source frames, so its seeks are
 * quantised onto the source frame grid.
 */
export function HeroScene({ media, offerHref }: HeroSceneProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [variant, setVariant] = useState<"desktop" | "mobile" | null>(null);
  const [mode, setMode] = useState<"static" | "scroll">(media ? "scroll" : "static");
  const [videoReady, setVideoReady] = useState(false);
  const [showEndFrame, setShowEndFrame] = useState(false);
  // The <video> mounts a render after the effect runs, so the effect cannot add its
  // own `seeked` listener. React attaches one that calls through this box instead.
  const onSeekedRef = useRef<() => void>(() => {});
  const onVideoLoadedRef = useRef<() => void>(() => {});

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
    let pinHeight = 0;
    let pinTop = 0;
    let running = false;
    let visible = false;
    // Frame grid of the source clip. Asking the decoder for two positions inside the
    // same frame costs a seek and shows nothing, so the controller works in frame
    // indices and only issues a seek when the index actually changes.
    let fps = 24;
    let shownFrame = -1;
    let wantedFrame = -1;

    const applyEnvironment = () => {
      if (reduced.matches || !media) {
        setMode("static");
        setShowEndFrame(Boolean(media));
        setVariant(null);
        return;
      }
      setMode("scroll");
      setShowEndFrame(false);
      const desktop = wide.matches;
      fps = (desktop ? media.desktop.fps : media.mobile.fps) || 24;
      // A different variant is a different source file: the decoder restarts at 0,
      // so nothing about the old clip's position carries over.
      shownFrame = -1;
      wantedFrame = -1;
      setVariant(desktop ? "desktop" : "mobile");
    };

    const header = document.querySelector<HTMLElement>(".site-header-stack");
    const measure = () => {
      // The header is already sticky. Pin directly beneath it from the first pixel
      // of scrolling instead of letting the hero travel up behind it first.
      pinTop = header?.getBoundingClientRect().height ?? 0;
      section.style.setProperty("--hero-header-height", `${pinTop}px`);
      pinHeight = pinRef.current?.offsetHeight ?? window.innerHeight;
    };

    const readProgress = () => {
      const track = trackRef.current;
      if (!track) return 0;
      const rect = track.getBoundingClientRect();
      const travel = rect.height - pinHeight;
      if (travel <= 0) return rect.top <= pinTop ? 1 : 0;
      return Math.min(1, Math.max(0, (pinTop - rect.top) / travel));
    };

    /**
     * Move the decoder onto `wantedFrame`.
     *
     * Seeking to the centre of the frame's interval keeps the request off the frame
     * boundary, where rounding would land a frame early or late. Requests are never
     * queued behind one another: a seek issued while another is running replaces it,
     * which is what keeps a slow decoder from working through stale positions.
     */
    const seekTo = (index: number) => {
      const video = videoRef.current;
      if (!video || index < 0 || index === shownFrame) return;
      shownFrame = index;
      video.currentTime = (index + 0.5) / fps;
    };

    // A decoder that ignored a request made mid-seek would otherwise sit on the
    // frame before the one the reader stopped at.
    const onSeeked = () => {
      if (wantedFrame !== shownFrame) seekTo(wantedFrame);
    };
    onSeekedRef.current = onSeeked;

    const paint = (progress: number) => {
      setVar(section, "--hero-p", progress);
      const intro = 1 - ramp(progress, 0.14, 0.44);
      setVar(section, "--hero-intro-o", intro);
      const rhythm = ramp(progress, 0.5, 0.62) * (1 - ramp(progress, 0.84, 0.96));
      setVar(section, "--hero-rhythm-o", rhythm);
      setVar(section, "--hero-fold", ramp(progress, 0.8, 1));
      const video = videoRef.current;
      // `duration` is the only precondition worth testing. `readyState` drops back to
      // HAVE_METADATA for the length of every seek, so gating on it here would skip
      // the next two frames' worth of updates and turn the scrub into a slideshow.
      if (video && Number.isFinite(video.duration) && video.duration > 0) {
        const lastFrame = Math.max(0, Math.round(video.duration * fps) - 1);
        const next = Math.min(lastFrame, Math.max(0, Math.round(progress * lastFrame)));
        if (next !== wantedFrame) {
          wantedFrame = next;
          seekTo(next);
        }
      }
    };

    // Reading the track here rather than in the scroll handler keeps it to one
    // layout read per painted frame, however many scroll events arrived.
    const render = () => {
      paint(readProgress());
    };

    const tick = () => {
      render();
      // Nothing is left settling once the frame is painted, because the scene is
      // already on the scroll position. The next scroll event asks for the next frame.
      running = false;
      frame = 0;
    };

    const request = () => {
      if (running || !visible) return;
      running = true;
      frame = requestAnimationFrame(tick);
    };

    const onScroll = () => {
      request();
    };

    const onResize = () => {
      measure();
      render();
    };
    onVideoLoadedRef.current = onResize;
    const resizeObserver = new ResizeObserver(onResize);
    if (header) resizeObserver.observe(header);
    if (pinRef.current) resizeObserver.observe(pinRef.current);

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) {
          measure();
          request();
        } else if (frame) {
          cancelAnimationFrame(frame);
          frame = 0;
          running = false;
          // Park the scene on the frame the reader left it on.
          render();
        }
      },
      { rootMargin: "120px 0px" },
    );

    applyEnvironment();
    measure();
    render();
    observer.observe(section);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    reduced.addEventListener("change", applyEnvironment);
    wide.addEventListener("change", applyEnvironment);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
      onVideoLoadedRef.current = () => {};
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
                  onLoadedData={() => {
                    setVideoReady(true);
                    onVideoLoadedRef.current();
                  }}
                  onSeeked={() => onSeekedRef.current()}
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
