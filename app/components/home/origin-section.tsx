import { BrandIllustration } from "../brand-illustration";
import { homeCopy } from "../../lib/content";
import type { StorefrontSettings } from "../../lib/frontend";

export function OriginSection({
  settings,
}: {
  settings: Pick<StorefrontSettings, "announcementEnabled" | "announcementUrl" | "announcementText" | "announcementLinkLabel">;
}) {
  const copy = homeCopy.origin;
  const video =
    settings.announcementEnabled && /(?:tiktok\.com|youtu\.?be)/i.test(settings.announcementUrl);

  return (
    <section className="origin" aria-labelledby="origin-title">
      {/* Only display-size white type and solid-ground controls sit on the photo; the
          body copy lives on the plain strip below it. */}
      <div className="origin-banner">
        <div className="origin-art"><BrandIllustration /></div>
        <div className="page-shell origin-banner-inner">
          <p className="eyebrow origin-eyebrow">{copy.eyebrow}</p>
          <h2 id="origin-title">{copy.title}</h2>
          <a className="button origin-cta" href="/farme">
            {copy.link}
          </a>
        </div>
      </div>
      <div className="page-shell origin-body">
        <p className="origin-text">{copy.text}</p>
        {video ? (
          <a className="origin-video" href={settings.announcementUrl} target="_blank" rel="noreferrer">
            <span className="origin-video-icon" aria-hidden="true">
              <svg viewBox="0 0 16 16" focusable="false">
                <path d="M4 2.5v11l9.5-5.5z" fill="currentColor" />
              </svg>
            </span>
            <span className="origin-video-text">
              {settings.announcementText}
              <small>{settings.announcementLinkLabel}</small>
            </span>
          </a>
        ) : null}
      </div>
    </section>
  );
}
