import { localizedMetadata } from "@/app/lib/i18n/server";
import { getLocalize } from "@/app/lib/i18n/server";
import type { Metadata } from "next";
import { ContentStamp } from "../components/policy-page";
import { frequentlyAskedQuestions } from "../lib/content";
import { canonicalUrl } from "../lib/seo";

export async function generateMetadata(): Promise<Metadata> { return localizedMetadata({
  title: "Česta pitanja",
  description: "Odgovori o pretplati, dostavi, izmenama i plaćanju.",
  alternates: { canonical: canonicalUrl("/faq") },
}); }

export default async function FaqPage() {
  const localize = await getLocalize();
  return localize((
    <div className="content-page">
      <header className="content-band content-hero">
        <div className="page-shell content-head">
          <div className="page-heading"><p className="eyebrow">FAQ</p><h1>Česta pitanja</h1></div>
          <ContentStamp glyph="drop" />
        </div>
      </header>
      <div className="content-band">
        <div className="page-shell">
          {/* The home page's FAQ rows (home/faq.css): full-width summaries between black
              rules, display questions and the square plus that turns into a cross. */}
          <div className="details-list faq-list">
            {frequentlyAskedQuestions.map(({ question, answer }) => (
              <details key={question}>
                <summary>
                  <span className="faq-question">{question}</span>
                  <span className="faq-icon" aria-hidden="true" />
                </summary>
                <p className="faq-answer">{answer}</p>
              </details>
            ))}
          </div>
          <div className="button-row content-actions"><a className="button" href="/prodavnica">Otvori prodavnicu</a><a className="button secondary" href="/kontakt">Postavi pitanje</a></div>
        </div>
      </div>
    </div>
  ));
}
