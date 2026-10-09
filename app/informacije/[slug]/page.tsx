import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContentPage } from "../../../server/content-pages";
import { canonicalUrl } from "../../lib/seo";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await getContentPage((await params).slug);
  if (!page) return { title: "Stranica nije pronađena", robots: { index: false, follow: false } };
  return { title: page.title, description: page.description, alternates: { canonical: canonicalUrl(`/informacije/${page.slug}`) }, openGraph: { title: page.title, description: page.description, url: canonicalUrl(`/informacije/${page.slug}`) } };
}
export default async function ContentPage({ params }: Props) {
  const page = await getContentPage((await params).slug);
  if (!page) notFound();
  return <article className="page-shell narrow"><header className="page-heading"><p className="eyebrow">Mleko i Mleko</p><h1>{page.title}</h1><p>{page.intro}</p></header>
    {page.sections.map((section, index) => <section key={index} style={{ marginBottom: "2rem" }}><h2>{section.heading}</h2>{section.text.split(/\n\s*\n/).map((paragraph, i) => <p key={i} style={{ whiteSpace: "pre-line" }}>{paragraph}</p>)}</section>)}
    <div className="button-row"><a className="button" href="/prodavnica">Pogledajte proizvode</a><a className="button secondary" href="/kontakt">Kontaktirajte nas</a></div>
  </article>;
}
