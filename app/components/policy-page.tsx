import Link from "next/link";

export type PolicySection = { title: string; paragraphs: string[] };

export function PolicyPage({ eyebrow, title, intro, sections }: { eyebrow: string; title: string; intro: string; sections: PolicySection[] }) {
  return (
    <div className="page-shell narrow policy-page">
      <header className="page-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="lead">{intro}</p><p className="muted small-text">Poslednje ažuriranje: 4. septembar 2026.</p></header>
      <div className="form-stack">
        {sections.map((section) => <section className="card" key={section.title}><h2>{section.title}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</section>)}
      </div>
      <p className="policy-contact">Pitanje ili zahtev? <Link href="/kontakt">Kontaktirajte Mleko i Mleko</Link>.</p>
    </div>
  );
}
