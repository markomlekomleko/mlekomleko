import { frequentlyAskedQuestions, homeCopy } from "../../lib/content";

export function FaqSection() {
  const copy = homeCopy.faq;

  return (
    <section className="faq" aria-labelledby="faq-home-title">
      <div className="page-shell">
        <div className="section-head faq-head">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id="faq-home-title">{copy.title}</h2>
        </div>
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
        <p className="faq-contact">
          {copy.contactPrompt}{" "}
          <a className="text-link" href="/kontakt">
            {copy.contactLink}
          </a>
        </p>
      </div>
    </section>
  );
}
