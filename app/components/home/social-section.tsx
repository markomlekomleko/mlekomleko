"use client";

import { useLocalize } from "@/app/lib/i18n/client";
import { homeCopy } from "../../lib/content";
import { INSTAGRAM_URL, TIKTOK_URL } from "../site-shell";

/**
 * Six of the brand's own TikTok clips, playable in place (meeting 17 Nov 2026: replace
 * the "Pogledaj video" link with a grid of six videos). The ids are public posts of
 * @mleko_i_mleko; swap them here when the client picks different ones.
 */
export const socialVideos = [
  { id: "7352938823233359109", title: "Pravo mleko više nije daleko — lokacije mlekomata" },
  { id: "7465682673936207109", title: "Jutro na farmi" },
  { id: "7258739044731931909", title: "Kako se koristi mlekomat" },
  { id: "7268735199112924422", title: "Kajmak od dva litra pravog mleka" },
  { id: "7509530328181034245", title: "Jedna flaša, dve priče" },
  { id: "7457308316155268358", title: "Poseti mlekomat" },
] as const;

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
            <li key={video.id}>
              <iframe
                src={`https://www.tiktok.com/player/v1/${video.id}?description=0&music_info=0&rel=0&native_context_menu=0`}
                title={video.title}
                loading="lazy"
                allow="encrypted-media; fullscreen; picture-in-picture"
                allowFullScreen
              />
            </li>
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
