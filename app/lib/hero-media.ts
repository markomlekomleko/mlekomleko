/**
 * Manifest for the scroll-linked hero introduction.
 *
 * Every path listed here must exist under `public/`. `tests/hero-media.test.mjs`
 * fails the build script when a listed file is missing, so the hero never renders
 * a reference to a file that returns 404. When no media has been exported yet,
 * set `heroMedia` to `null` and the hero falls back to the static product poster.
 *
 * `status: "temporary"` marks development material: generated scene, packaging shown
 * from the 3D brand render rather than a confirmed photograph of the physical bottle.
 */
export type HeroVariant = {
  video: string | null;
  poster: string;
  endFrame: string | null;
  width: number;
  height: number;
  /** Source duration in seconds. Documentation for the export; at runtime the
      controller reads the decoded `duration` off the element itself. */
  durationSeconds: number;
  /** Source frame rate. The controller seeks on this grid, so it never asks the
      decoder for two positions that resolve to the same frame. Both variants stay at
      the 24 fps of the master: on each one it is seek throughput, not source frame
      rate, that limits how many distinct frames a scroll can show. */
  fps: number;
  alt: string;
};

export type HeroMedia = {
  status: "temporary" | "final";
  desktop: HeroVariant;
  mobile: HeroVariant;
};

const alt =
  "Mleko se sipa u čašu pored staklene flaše Mleko i Mleko na jutarnjem stolu";

export const heroMedia: HeroMedia | null = {
  status: "temporary",
  desktop: {
    video: "/media/hero/hero-desktop.mp4",
    poster: "/media/hero/poster-desktop.webp",
    endFrame: "/media/hero/end-desktop.webp",
    // 1080p rather than the 4K master: a seek costs roughly one frame decode, so the
    // export resolution sets the scrub's frame ceiling. See the encoding note in
    // public/media/hero/manifest.json for the measurements.
    width: 1920,
    height: 1080,
    durationSeconds: 8.04,
    fps: 24,
    alt,
  },
  mobile: {
    video: "/media/hero/hero-mobile.mp4",
    poster: "/media/hero/poster-mobile.webp",
    endFrame: "/media/hero/end-mobile.webp",
    width: 720,
    height: 1280,
    durationSeconds: 8.04,
    fps: 24,
    alt,
  },
};
