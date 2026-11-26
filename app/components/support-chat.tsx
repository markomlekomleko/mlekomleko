"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocale, useLocalize } from "../lib/i18n/client";
import { toCyrillic, translate } from "../lib/i18n/translate";
import { frequentlyAskedQuestions } from "../lib/content";
import styles from "./support-chat.module.css";

type Reply = { answer: string; href: string; link: string };
type Exchange = { question: string; reply: Reply };

const faqTopics = [
  { id: "deadline", keywords: "rok,izmen,promen,odbrojav,cutoff,deadline,срок,измен", href: "/kako-funkcionise" },
  { id: "bottles", keywords: "flas,ambalaz,stakl,bottle,бутыл,тар", href: "/kako-funkcionise" },
  { id: "addition", keywords: "dodam,dodati,dodat,add,добав", href: "/nalog" },
  { id: "subscription", keywords: "pretplat,pauz,otkaz,preskoc,subscription,pause,skip,подпис,пропуст", href: "/pravila-pretplate" },
  { id: "payment", keywords: "plat,gotov,kartic,payment,cash,pay,оплат,налич", href: "/kako-funkcionise" },
  { id: "delivery", keywords: "dostav,isporuk,beograd,novi sad,delivery,deliver,достав", href: "/dostava" },
  { id: "milk", keywords: "sirov,prokuv,kuva,bezbed,analiz,laborator,raw,boil,safe,сыр,кипят,анализ", href: "/analize" },
];
const suggestedQuestions = ["delivery", "subscription", "bottles"].flatMap((id) =>
  frequentlyAskedQuestions.filter((item) => item.id === id),
);

const fallback: Reply = {
  answer: "Nemam odgovor na to pitanje. Probaj neku od ponuđenih tema ili nam piši preko stranice Kontakt.",
  href: "/kontakt",
  link: "Kontakt",
};

function normalize(text: string) {
  // Normalise Serbian Latin and Cyrillic together, including typing without diacritics.
  return toCyrillic(text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replaceAll("đ", "dj"))
    .replace(/[чћ]/g, "ц").replace(/ш/g, "с").replace(/ж/g, "з")
    .replace(/њ/g, "нј").replace(/љ/g, "лј").replace(/ђ/g, "дј")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const searchableTopics = faqTopics.map((topic) => ({
  ...topic,
  prefixes: topic.keywords.split(",").map(normalize),
}));

export function SupportChat() {
  const localize = useLocalize();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"chat" | "faq">("chat");
  const [draft, setDraft] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const launcher = useRef<HTMLButtonElement>(null);
  const modeButton = useRef<HTMLButtonElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) modeButton.current?.focus();
  }, [open]);

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [open, view, exchanges]);

  function close() {
    setOpen(false);
    launcher.current?.focus();
  }

  function ask(question: string) {
    const text = question.trim();
    if (!text) return;
    const normalized = normalize(text);
    const exact = frequentlyAskedQuestions.find(({ question }) =>
      normalize(translate(question, locale)) === normalized || normalize(question) === normalized,
    );
    const topic = exact
      ? searchableTopics.find(({ id }) => id === exact.id)
      : searchableTopics.find(({ prefixes }) =>
          prefixes.some((prefix) => (" " + normalized).includes(" " + prefix)),
        );
    const match = exact ?? frequentlyAskedQuestions.find(({ id }) => id === topic?.id);
    const reply = match ? { answer: match.answer, href: topic?.href ?? "/faq", link: "Pogledaj više" } : fallback;
    setExchanges((previous) => [...previous, { question: text, reply }]);
    setDraft("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ask(draft);
  }

  return localize((
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- Escape closes the widget from any of its controls.
    <div className={styles.widget} onKeyDown={(event) => {
      if (open && event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    }}>
      {open ? (
        <section id="support-chat" className={styles.panel} aria-labelledby="support-chat-title">
          <header className={styles.header}>
            <Image src="/images/mleko-i-mleko-logo-mark.png" alt="" width={36} height={36} />
            <h2 id="support-chat-title">Pomoć Mleko i Mleko</h2>
          </header>
          <div className={styles.switch} role="group" aria-label="Način pomoći">
            <button ref={modeButton} type="button" aria-pressed={view === "chat"} onClick={() => setView("chat")}>Razgovor</button>
            <button type="button" aria-pressed={view === "faq"} onClick={() => setView("faq")}>Česta pitanja</button>
          </div>
          {view === "chat" ? (
            <>
              {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keep the scrollable conversation keyboard-accessible. */}
              <div className={styles.log} ref={log} role="log" aria-label="Poruke" tabIndex={0} data-clarity-mask="true">
                <p className={styles.reply}>Ćao! Pitaj me o dostavi, pretplati, plaćanju ili vraćanju flaša.</p>
                {exchanges.length === 0 ? (
                  <div className={styles.suggestions}>
                    {suggestedQuestions.map(({ question }) => (
                      <button key={question} type="button" onClick={() => { ask(translate(question, locale)); input.current?.focus(); }}>
                        {question}
                      </button>
                    ))}
                  </div>
                ) : exchanges.map(({ question, reply }, index) => (
                  <div className={styles.exchange} key={index}>
                    <p className={styles.question} data-no-translate>{question}</p>
                    <p className={styles.reply}>{reply.answer} <a href={reply.href}>{reply.link}</a></p>
                  </div>
                ))}
              </div>
              <form className={styles.form} onSubmit={submit}>
                <input ref={input} aria-label="Tvoje pitanje" placeholder="Napiši pitanje…" maxLength={300} value={draft} onChange={(event) => setDraft(event.target.value)} autoComplete="off" />
                <button type="submit" disabled={!draft.trim()}>Pošalji</button>
              </form>
            </>
          ) : (
            <div className={styles.faq}>
              {frequentlyAskedQuestions.map(({ question, answer }) => (
                <details key={question}>
                  <summary>{question}</summary>
                  <p>{answer}</p>
                </details>
              ))}
              <a href="/faq">Sva česta pitanja</a>
            </div>
          )}
        </section>
      ) : null}
      <button
        ref={launcher}
        type="button"
        className={styles.launcher}
        aria-expanded={open}
        aria-controls={open ? "support-chat" : undefined}
        onClick={() => open ? close() : setOpen(true)}
      >
        <span aria-hidden="true" className={open ? styles.closeIcon : styles.bubble}>{open ? "×" : "···"}</span>
        {open ? "Zatvori pomoć" : "Pomoć"}
      </button>
    </div>
  ));
}
