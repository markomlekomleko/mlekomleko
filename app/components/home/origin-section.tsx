import type { StorefrontSettings } from "../../lib/frontend";

export function OriginSection({
  settings,
}: {
  settings: Pick<StorefrontSettings, "announcementEnabled" | "announcementUrl" | "announcementText" | "announcementLinkLabel">;
}) {
  return (
    <section className="origin" aria-labelledby="origin-title">
      <picture className="origin-image">
        <source srcSet="/images/farma.avif" type="image/avif" />
        <source srcSet="/images/farma.webp" type="image/webp" />
        <img
          src="/images/farma.jpg"
          alt="Krave na pašnjaku — ilustracija domaćeg uzgoja"
          width="1600"
          height="1066"
          loading="lazy"
        />
      </picture>
      <div className="page-shell origin-content">
        <div>
          <p className="eyebrow">03 / Odakle dolazi</p>
          <h2 id="origin-title">
            Dobar ukus ima
            <br />
            <em>svoje poreklo.</em>
          </h2>
        </div>
        <div className="origin-copy">
          <p>
            Na domaćim farmama počinje put našeg kravljeg i kozjeg mleka. Do tebe stiže punomasno i
            sirovo, u povratnoj staklenoj flaši.
          </p>
          <a className="text-link" href="/farme">
            Upoznaj naše farme
          </a>
          {settings.announcementEnabled &&
          /(?:tiktok\.com|youtu\.?be)/i.test(settings.announcementUrl) ? (
            <a className="origin-video" href={settings.announcementUrl} target="_blank" rel="noreferrer">
              <span aria-hidden="true">▷</span>
              <span>
                {settings.announcementText}
                <small>{settings.announcementLinkLabel}</small>
              </span>
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
