"use client";

/* eslint-disable @next/next/no-img-element -- Local video covers. */
import { useLocalize } from "@/app/lib/i18n/client";
import { useState } from "react";
import { homeCopy } from "../../lib/content";
import { INSTAGRAM_URL, TIKTOK_URL } from "../site-shell";

/**
 * Six of the brand's own TikTok clips, playable in place (meeting 17 Nov 2026: replace
 * the "Pogledaj video" link with a grid of six videos). The ids are public posts of
 * @mleko_i_mleko; swap them here when the client picks different ones.
 *
 * TikTok's player sits on tracker block lists (Safari and Firefox tracking protection,
 * Brave, ad blockers), so for some visitors the embed stayed black. The clips are now
 * served from this site (/video/tiktok/<id>.mp4, covers in /images/tiktok/<id>.webp)
 * and play in a plain <video>, so every browser can play them; the link under each
 * still leads to the post on TikTok.
 */
export const socialVideos = [
  { id: "7352938823233359109", title: "Pravo mleko više nije daleko — lokacije mlekomata" },
  { id: "7465682673936207109", title: "Jutro na farmi" },
  { id: "7258739044731931909", title: "Kako se koristi mlekomat" },
  { id: "7268735199112924422", title: "Kajmak od dva litra pravog mleka" },
  { id: "7509530328181034245", title: "Jedna flaša, dve priče" },
  { id: "7457308316155268358", title: "Poseti mlekomat" },
] as const;

function TikTokClip({ id, title }: { id: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  return (
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
      <a className="social-open" href={`https://www.tiktok.com/@mleko_i_mleko/video/${id}`} target="_blank" rel="noreferrer">Pogledaj na TikToku ↗</a>
    </li>
  );
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
