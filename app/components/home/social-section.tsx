"use client";

/* eslint-disable @next/next/no-img-element -- Local video covers. */
import { useLocalize } from "@/app/lib/i18n/client";
import { useState } from "react";
import { homeCopy } from "../../lib/content";
import { INSTAGRAM_URL, TIKTOK_URL } from "../site-shell";

// The original posts are linked below each clip. Playback and covers are served locally.
export const socialVideos = [
  { id: "7278650033472294150", title: "Upoznaj farmu" },
  { id: "7258739044731931909", title: "Kako radi mlekomat" },
  { id: "7509530328181034245", title: "Rumenka na farmi" },
] as const;

function TikTokClip({ id, title }: { id: string; title: string }) {
  // A component of its own, so it runs its own localize pass; the title arrives already
  // localised (the parent's pass translates `title` props) and passes through unchanged.
  const localize = useLocalize();
  const [playing, setPlaying] = useState(false);
  return localize((
    <li>
      {playing ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption -- TikTok clips carry their captions burned into the picture; there are no separate caption files.
        <video
          className="social-video"
          src={`/video/tiktok/${id}.mp4`}
          poster={`/images/tiktok/${id}.webp`}
          controls
          autoPlay
          playsInline
          preload="auto"
          aria-label={title}
          // One clip at a time: starting one pauses the others.
          onPlay={(event) => {
            document.querySelectorAll<HTMLVideoElement>(".social-video").forEach((video) => {
              if (video !== event.currentTarget) video.pause();
            });
          }}
        />
      ) : (
        <button type="button" className="social-cover" onClick={() => setPlaying(true)} aria-label={`Pusti video: ${title}`}>
          <img src={`/images/tiktok/${id}.webp`} alt="" width="540" height="960" loading="lazy" />
          <span className="social-play" aria-hidden="true" />
        </button>
      )}
      <p className="social-title">{title}</p>
      <a className="social-open" href={`https://www.tiktok.com/@mleko_i_mleko/video/${id}`} target="_blank" rel="noreferrer">Pogledaj na TikToku ↗</a>
    </li>
  ));
}

export function SocialSection() {
  const localize = useLocalize();
  const copy = homeCopy.social;
  return localize((
    <section className="social" aria-labelledby="social-title">
      <div className="page-shell">
        <div className="section-head social-head">
          <p className="eyebrow" data-no-translate>{copy.eyebrow}</p>
          <h2 id="social-title">{copy.title}</h2>
          <p className="lead">{copy.lead}</p>
        </div>
        {/* Swipeable row on phones, so it must be keyboard-reachable (axe scrollable-region-focusable). */}
        <ul
          className="social-grid"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard-reachable
          tabIndex={0}
          aria-label="Video snimci"
        >
          {socialVideos.map((video) => (
            <TikTokClip key={video.id} id={video.id} title={video.title} />
          ))}
        </ul>
        <p className="social-links">
          <a className="button secondary" href={INSTAGRAM_URL} target="_blank" rel="noreferrer">{copy.instagram} ↗</a>
          <a className="button secondary" href={TIKTOK_URL} target="_blank" rel="noreferrer">{copy.tiktok} ↗</a>
        </p>
      </div>
    </section>
  ));
}
