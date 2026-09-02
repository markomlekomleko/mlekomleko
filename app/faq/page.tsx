import type { Metadata } from "next";
import { frequentlyAskedQuestions } from "../lib/content";
import { canonicalUrl } from "../lib/seo";

export const metadata: Metadata = {
  title: "Česta pitanja",
  description: "Odgovori o pretplati, dostavi, izmenama i plaćanju.",
  alternates: { canonical: canonicalUrl("/faq") },
};

export default function FaqPage() {
  return (
    <div className="page-shell narrow">
      <header className="page-heading"><p className="eyebrow">FAQ</p><h1>Česta pitanja</h1></header>
      <div className="details-list">{frequentlyAskedQuestions.map(({ question, answer }) => <details key={question}><summary>{question}</summary><p className="muted" style={{ marginTop: "0.8rem" }}>{answer}</p></details>)}</div>
      <div className="button-row"><a className="button" href="/prodavnica">Otvori prodavnicu</a><a className="button secondary" href="/kontakt">Postavite pitanje</a></div>
    </div>
  );
}
