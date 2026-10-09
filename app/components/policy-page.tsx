import Link from "next/link";

export type PolicySection = { title: string; paragraphs: string[] };

export function PolicyPage({ eyebrow, title, intro, sections }: { eyebrow: string; title: string; intro: string; sections: PolicySection[] }) {
  return (
    <div className="content-page policy-page">
      <header className="content-band content-hero">
        <div className="page-shell">
          <div className="page-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="lead">{intro}</p><p className="policy-updated">Poslednje ažuriranje: 4. septembar 2026.</p></div>
        </div>
      </header>
      <div className="content-band">
        <div className="page-shell">
          <div className="policy-list">
            {sections.map((section) => <section className="policy-row" key={section.title}><h2>{section.title}</h2><div className="policy-text">{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div></section>)}
          </div>
          <p className="policy-contact">Pitanje ili zahtev? <Link href="/kontakt">Javi nam se</Link>.</p>
        </div>
      </div>
    </div>
  );
}
