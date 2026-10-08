import { frequentlyAskedQuestions } from "../../lib/content";

export function FaqSection() {
  return (
    <section className="faq" aria-labelledby="faq-home-title">
      <div className="page-shell">
        <div className="section-head">
          <p className="eyebrow">05 / Pre prve porudžbine</p>
          <h2 id="faq-home-title">Sve što treba da znaš.</h2>
        </div>
        <div className="details-list faq-list">
          {frequentlyAskedQuestions.map(({ question, answer }) => (
            <details key={question}>
              <summary>
                {question}
                <span aria-hidden="true">＋</span>
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
        <p className="faq-contact">
          Nisi našao odgovor? <a className="text-link" href="/kontakt">Piši nam.</a>
        </p>
      </div>
    </section>
  );
}
